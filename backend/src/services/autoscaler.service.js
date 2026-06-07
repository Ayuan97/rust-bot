import { EventEmitter } from 'events';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import costGuardService from './cost-guard.service.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

class AutoScalerService extends EventEmitter {
  constructor() {
    super();
    this.enabled = String(process.env.AUTOSCALER_ENABLED || 'false') === 'true';
    this.intervalMs = Number(process.env.AUTOSCALER_INTERVAL_MS || 30000);
    this.cooldownMs = Number(process.env.AUTOSCALER_COOLDOWN_MS || 120000);
    this.minNodes = Number(process.env.AUTOSCALER_MIN_NODES || 0);

    this.hottestThreshold = Number(process.env.AUTOSCALER_HOTTEST_THRESHOLD || 0.75);
    this.globalThreshold = Number(process.env.AUTOSCALER_GLOBAL_THRESHOLD || 0.7);
    this.scaleDownThreshold = Number(process.env.AUTOSCALER_DOWN_THRESHOLD || 0.35);

    this.hottestHoldMs = Number(process.env.AUTOSCALER_HOTTEST_HOLD_MS || 30000);
    this.globalHoldMs = Number(process.env.AUTOSCALER_GLOBAL_HOLD_MS || 120000);
    this.pendingHoldMs = Number(process.env.AUTOSCALER_PENDING_HOLD_MS || 30000);
    this.idleHoldMs = Number(process.env.AUTOSCALER_IDLE_HOLD_MS || 900000);
    // 阈值短暂回落的宽限期：避免单次抖动把“持续越阈”计时清零，导致持续高压也凑不满 HOLD 窗口
    this.holdReleaseGraceMs = Number(process.env.AUTOSCALER_HOLD_RELEASE_GRACE_MS || 5000);

    this.estimatedNodeMonthlyCost = Number(process.env.AUTOSCALER_NODE_MONTHLY_COST || 120);
    this.scaleWebhook = process.env.AUTOSCALER_WEBHOOK_URL || '';
    this.scaleWebhookToken = process.env.AUTOSCALER_WEBHOOK_TOKEN || '';
    // 注意：scaleUp/DownCommand 是“可执行文件路径”，参数经 argv + 环境变量传入、不经 shell（杜绝命令注入）
    this.scaleUpCommand = process.env.AUTOSCALER_SCALE_UP_COMMAND || '';
    this.scaleDownCommand = process.env.AUTOSCALER_SCALE_DOWN_COMMAND || '';

    this.timer = null;
    this.sessionService = null;
    this.evaluating = false;
    this.lastActionAt = 0;
    this.hotSince = null;
    this.globalSince = null;
    this.pendingSince = null;
    this.idleSince = null;
    this.hotLastOk = 0;
    this.globalLastOk = 0;
    this.pendingLastOk = 0;
    this.idleLastOk = 0;
  }

  setSessionService(sessionService) {
    this.sessionService = sessionService;
  }

  start() {
    if (!this.enabled || this.timer || !this.sessionService) {
      return;
    }
    this.timer = setInterval(() => {
      this.evaluate('interval').catch((error) => {
        logger.error('[autoscaler] 自动扩容评估失败:', error.message);
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async notifyPressure(reason = 'manual') {
    if (!this.enabled) return;
    await this.evaluate(`pressure:${reason}`);
  }

  /**
   * 越阈计时（带回落宽限）：满足则记录首次时间并刷新 lastOk；不满足且超过宽限期才清零。
   * 避免单次瞬时回落把持续越阈的计时清零。
   * @private
   */
  _markHold(cond, sinceKey, lastOkKey, now) {
    if (cond) {
      if (!this[sinceKey]) this[sinceKey] = now;
      this[lastOkKey] = now;
    } else if (this[sinceKey] && now - this[lastOkKey] > this.holdReleaseGraceMs) {
      this[sinceKey] = null;
    }
  }

  async evaluate(trigger = 'manual') {
    if (!this.enabled || !this.sessionService) {
      return { action: 'disabled' };
    }
    // 重入保护：interval 与 notifyPressure 可能并发，串行化以免重复扩容 / 绕过冷却
    if (this.evaluating) {
      return { action: 'busy' };
    }
    this.evaluating = true;
    try {
      const metrics = await this.sessionService.getScalingMetrics();
      const now = Date.now();

      this._markHold(
        metrics.hottestServerUtilization >= this.hottestThreshold,
        'hotSince',
        'hotLastOk',
        now
      );
      this._markHold(
        metrics.globalUtilization >= this.globalThreshold,
        'globalSince',
        'globalLastOk',
        now
      );
      this._markHold(metrics.pendingQueue > 0, 'pendingSince', 'pendingLastOk', now);

      const idleNodeIds = await this.sessionService.getIdleNodeIds();
      this._markHold(idleNodeIds.length > this.minNodes, 'idleSince', 'idleLastOk', now);

      const shouldScaleUp =
        (this.hotSince && now - this.hotSince >= this.hottestHoldMs) ||
        (this.globalSince && now - this.globalSince >= this.globalHoldMs) ||
        (this.pendingSince && now - this.pendingSince >= this.pendingHoldMs);

      if (shouldScaleUp) {
        return await this.scaleUp(metrics, trigger);
      }

      const shouldScaleDown =
        metrics.globalUtilization <= this.scaleDownThreshold &&
        idleNodeIds.length > this.minNodes &&
        this.idleSince &&
        now - this.idleSince >= this.idleHoldMs;

      if (shouldScaleDown) {
        return await this.scaleDown(metrics, idleNodeIds, trigger);
      }

      return { action: 'noop', metrics };
    } finally {
      this.evaluating = false;
    }
  }

  async scaleUp(metrics, trigger) {
    const now = Date.now();
    if (now - this.lastActionAt < this.cooldownMs) {
      return { action: 'cooldown', direction: 'up' };
    }

    const budgetCheck = await costGuardService.canReserve(this.estimatedNodeMonthlyCost);
    if (!budgetCheck.allowed) {
      this.emit('scale:blocked', {
        direction: 'up',
        reason: 'BUDGET_LIMIT',
        trigger,
        metrics,
        budget: budgetCheck.snapshot,
        estimatedNodeMonthlyCost: this.estimatedNodeMonthlyCost,
      });
      return {
        action: 'blocked',
        direction: 'up',
        reason: 'BUDGET_LIMIT',
        budget: budgetCheck.snapshot,
      };
    }

    const result = await this.runScaleAction({
      direction: 'up',
      count: 1,
      trigger,
      metrics,
    });

    if (result.success) {
      this.lastActionAt = now;
      this.hotSince = null;
      this.globalSince = null;
      this.pendingSince = null;
      this.emit('scale:up', { trigger, metrics, result });
    }

    return {
      action: result.success ? 'scaled' : 'failed',
      direction: 'up',
      result,
    };
  }

  async scaleDown(metrics, idleNodeIds, trigger) {
    const now = Date.now();
    if (now - this.lastActionAt < this.cooldownMs) {
      return { action: 'cooldown', direction: 'down' };
    }

    const removableCount = Math.max(0, idleNodeIds.length - this.minNodes);
    if (removableCount <= 0) {
      return { action: 'noop', direction: 'down' };
    }

    const nodeIds = idleNodeIds.slice(0, 1);
    const result = await this.runScaleAction({
      direction: 'down',
      count: 1,
      nodeIds,
      trigger,
      metrics,
    });

    if (result.success) {
      this.lastActionAt = now;
      this.idleSince = null;
      this.emit('scale:down', { trigger, metrics, nodeIds, result });
    }

    return {
      action: result.success ? 'scaled' : 'failed',
      direction: 'down',
      result,
    };
  }

  async runScaleAction({ direction, count, nodeIds = [], trigger, metrics }) {
    const payload = {
      direction,
      count,
      nodeIds,
      trigger,
      metrics,
      timestamp: new Date().toISOString(),
    };

    if (this.scaleWebhook) {
      const headers = {};
      if (this.scaleWebhookToken) {
        headers['x-webhook-token'] = this.scaleWebhookToken;
      }
      await axios.post(this.scaleWebhook, payload, { headers, timeout: 10000 });
      return { success: true, provider: 'webhook' };
    }

    const file = direction === 'up' ? this.scaleUpCommand : this.scaleDownCommand;
    if (file) {
      // execFile 不经 shell：direction/count/nodeIds 作为独立 argv 与环境变量传入。
      // 即使 nodeId 含 shell 元字符也只是脚本的普通字符串参数，不会被解释执行（杜绝命令注入）。
      const args = [direction, String(count), nodeIds.join(',')];
      const { stdout, stderr } = await execFileAsync(file, args, {
        timeout: 15000,
        env: {
          ...process.env,
          SCALE_DIRECTION: direction,
          SCALE_COUNT: String(count),
          SCALE_NODE_IDS: nodeIds.join(','),
        },
      });
      return {
        success: true,
        provider: 'command',
        stdout: stdout?.toString().trim() || '',
        stderr: stderr?.toString().trim() || '',
      };
    }

    logger.warn('[autoscaler] 未配置 webhook 或命令，跳过扩缩容动作');
    return { success: false, provider: 'none', reason: 'NO_PROVIDER_CONFIGURED' };
  }
}

export default new AutoScalerService();
