import { EventEmitter } from 'events';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import costGuardService from './cost-guard.service.js';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

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

    this.estimatedNodeMonthlyCost = Number(process.env.AUTOSCALER_NODE_MONTHLY_COST || 120);
    this.scaleWebhook = process.env.AUTOSCALER_WEBHOOK_URL || '';
    this.scaleWebhookToken = process.env.AUTOSCALER_WEBHOOK_TOKEN || '';
    this.scaleUpCommand = process.env.AUTOSCALER_SCALE_UP_COMMAND || '';
    this.scaleDownCommand = process.env.AUTOSCALER_SCALE_DOWN_COMMAND || '';

    this.timer = null;
    this.sessionService = null;
    this.lastActionAt = 0;
    this.hotSince = null;
    this.globalSince = null;
    this.pendingSince = null;
    this.idleSince = null;
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

  async evaluate(trigger = 'manual') {
    if (!this.enabled || !this.sessionService) {
      return { action: 'disabled' };
    }

    const metrics = await this.sessionService.getScalingMetrics();
    const now = Date.now();

    this.hotSince = metrics.hottestServerUtilization >= this.hottestThreshold
      ? (this.hotSince || now)
      : null;

    this.globalSince = metrics.globalUtilization >= this.globalThreshold
      ? (this.globalSince || now)
      : null;

    this.pendingSince = metrics.pendingQueue > 0
      ? (this.pendingSince || now)
      : null;

    const idleNodeIds = await this.sessionService.getIdleNodeIds();
    this.idleSince = idleNodeIds.length > this.minNodes
      ? (this.idleSince || now)
      : null;

    const shouldScaleUp =
      (this.hotSince && now - this.hotSince >= this.hottestHoldMs) ||
      (this.globalSince && now - this.globalSince >= this.globalHoldMs) ||
      (this.pendingSince && now - this.pendingSince >= this.pendingHoldMs);

    if (shouldScaleUp) {
      return this.scaleUp(metrics, trigger);
    }

    const shouldScaleDown =
      metrics.globalUtilization <= this.scaleDownThreshold &&
      idleNodeIds.length > this.minNodes &&
      this.idleSince &&
      now - this.idleSince >= this.idleHoldMs;

    if (shouldScaleDown) {
      return this.scaleDown(metrics, idleNodeIds, trigger);
    }

    return { action: 'noop', metrics };
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

    const template = direction === 'up' ? this.scaleUpCommand : this.scaleDownCommand;
    if (template) {
      const command = template
        .replace(/\{\{count\}\}/g, String(count))
        .replace(/\{\{nodeIds\}\}/g, nodeIds.join(','));
      const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
      return {
        success: true,
        provider: 'command',
        stdout: stdout?.trim() || '',
        stderr: stderr?.trim() || '',
      };
    }

    logger.warn('[autoscaler] 未配置 webhook 或命令，跳过扩缩容动作');
    return { success: false, provider: 'none', reason: 'NO_PROVIDER_CONFIGURED' };
  }
}

export default new AutoScalerService();
