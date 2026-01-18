/**
 * UserEventPrediction - 用户级别的事件预测服务
 * 通过分析历史数据学习事件刷新模式，提前通知用户
 *
 * 数据模型：
 * - event_spawn_patterns: 基于物理服务器（battlemetricsId），所有用户共享
 * - event_predictions: 基于用户，每个用户独立的预测和通知状态
 */

import EventEmitter from 'events';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { notify } from '../utils/messages.js';

// 事件类型映射
const EVENT_TYPES = {
  CARGO_SPAWN: 'CARGO_SPAWN',
  HELI_SPAWN: 'HELI_SPAWN',
  SMALL_OIL_COOLDOWN: 'SMALL_OIL_COOLDOWN',
  LARGE_OIL_COOLDOWN: 'LARGE_OIL_COOLDOWN'
};

// 事件类型显示名称
const EVENT_TYPE_NAMES = {
  CARGO_SPAWN: '货船',
  HELI_SPAWN: '武装直升机',
  SMALL_OIL_COOLDOWN: '小油井冷却',
  LARGE_OIL_COOLDOWN: '大油井冷却'
};

class UserEventPrediction extends EventEmitter {
  // 最小样本数（低于此不预测）
  static MIN_SAMPLES = 5;
  // 滑动窗口大小
  static WINDOW_SIZE = 20;
  // 异常值过滤阈值（超过平均值的倍数）
  static OUTLIER_THRESHOLD = 3;
  // 最小置信度阈值
  static MIN_CONFIDENCE = 0.6;
  // 默认提前通知时间（毫秒）
  static DEFAULT_ADVANCE_MINUTES = 5;

  constructor(userId, rustPlusService, eventMonitorService) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    this.userId = userId;
    this.rustPlusService = rustPlusService;
    this.eventMonitorService = eventMonitorService;

    // 预测通知计时器 Map<serverId_eventType, timeoutId>
    this.notificationTimers = new Map();

    // 通知设置缓存
    this.notificationSettings = null;

    // 服务器 battlemetricsId 缓存 Map<serverId, battlemetricsId>
    this.serverBmIdCache = new Map();
  }

  /**
   * 获取服务器的 battlemetricsId
   * @private
   */
  async _getBattlemetricsId(serverId) {
    // 先检查缓存
    if (this.serverBmIdCache.has(serverId)) {
      return this.serverBmIdCache.get(serverId);
    }

    try {
      const server = await prisma.servers.findUnique({
        where: { id: serverId },
        select: { battlemetricsId: true }
      });

      if (server && server.battlemetricsId) {
        this.serverBmIdCache.set(serverId, server.battlemetricsId);
        return server.battlemetricsId;
      }

      return null;
    } catch (error) {
      logger.error(`获取服务器 ${serverId} 的 battlemetricsId 失败:`, error);
      return null;
    }
  }

  /**
   * 加载通知设置
   */
  async loadNotificationSettings() {
    try {
      const settings = await prisma.notification_settings.findUnique({
        where: { userId: this.userId }
      });

      if (settings && settings.settings) {
        this.notificationSettings = settings.settings;
      } else {
        this.notificationSettings = {};
      }
    } catch (error) {
      logger.error(`加载用户 ${this.userId} 的预测通知设置失败:`, error);
      this.notificationSettings = {};
    }
  }

  /**
   * 检查预测通知是否启用
   */
  isPredictionEnabled(eventType) {
    if (!this.notificationSettings) {
      return false;
    }

    // 总开关
    if (!this.notificationSettings.prediction_enabled) {
      return false;
    }

    // 分类开关
    const eventTypeToSetting = {
      CARGO_SPAWN: 'prediction_cargo_enabled',
      HELI_SPAWN: 'prediction_heli_enabled',
      SMALL_OIL_COOLDOWN: 'prediction_oil_rig_enabled',
      LARGE_OIL_COOLDOWN: 'prediction_oil_rig_enabled'
    };

    const settingKey = eventTypeToSetting[eventType];
    return settingKey ? (this.notificationSettings[settingKey] !== false) : true;
  }

  /**
   * 获取提前通知时间（分钟）
   */
  getAdvanceMinutes() {
    return this.notificationSettings?.prediction_advance_minutes || UserEventPrediction.DEFAULT_ADVANCE_MINUTES;
  }

  /**
   * 获取最小置信度
   */
  getMinConfidence() {
    return this.notificationSettings?.prediction_min_confidence || UserEventPrediction.MIN_CONFIDENCE;
  }

  /**
   * 记录事件发生，更新模式数据
   * @param {string} serverId - 用户的服务器ID（servers表）
   * @param {string} eventType - 事件类型
   * @param {number} eventTime - 事件发生时间戳(ms)
   */
  async recordEvent(serverId, eventType, eventTime) {
    try {
      // 验证事件类型
      if (!EVENT_TYPES[eventType]) {
        logger.debug(`未知的预测事件类型: ${eventType}`);
        return;
      }

      // 获取物理服务器的 battlemetricsId
      const battlemetricsId = await this._getBattlemetricsId(serverId);
      if (!battlemetricsId) {
        logger.debug(`服务器 ${serverId} 没有关联 battlemetricsId，跳过预测记录`);
        return;
      }

      const eventTimeDate = new Date(eventTime);

      // 获取现有模式数据（基于 battlemetricsId）
      let pattern = await prisma.event_spawn_patterns.findUnique({
        where: {
          battlemetricsId_eventType: {
            battlemetricsId,
            eventType
          }
        }
      });

      if (!pattern) {
        // 首次记录，创建新模式
        pattern = await prisma.event_spawn_patterns.create({
          data: {
            battlemetricsId,
            eventType,
            sampleCount: 0,
            recentIntervals: [],
            lastEventTime: eventTimeDate
          }
        });

        logger.debug(`物理服务器 ${battlemetricsId}: 创建 ${eventType} 模式记录`);

        // 标记该用户的预测已发生
        await this._markPredictionOccurred(serverId, battlemetricsId, eventType, eventTimeDate);
        return;
      }

      // 计算与上次事件的间隔
      if (!pattern.lastEventTime) {
        await prisma.event_spawn_patterns.update({
          where: { id: pattern.id },
          data: { lastEventTime: eventTimeDate }
        });

        await this._markPredictionOccurred(serverId, battlemetricsId, eventType, eventTimeDate);
        return;
      }

      const lastTime = new Date(pattern.lastEventTime).getTime();
      const interval = eventTime - lastTime;

      // 过滤异常值（太短的间隔可能是重复事件）
      const MIN_INTERVAL = 5 * 60 * 1000; // 最小5分钟
      if (interval < MIN_INTERVAL) {
        logger.debug(`物理服务器 ${battlemetricsId}: ${eventType} 间隔过短 (${interval}ms)，跳过记录`);
        return;
      }

      // 获取最近间隔列表
      let recentIntervals = [];
      if (pattern.recentIntervals && Array.isArray(pattern.recentIntervals)) {
        recentIntervals = [...pattern.recentIntervals];
      }

      // 如果已有足够数据，过滤异常值
      if (recentIntervals.length >= 3 && pattern.avgInterval) {
        const threshold = pattern.avgInterval * UserEventPrediction.OUTLIER_THRESHOLD;
        if (interval > threshold) {
          logger.debug(`物理服务器 ${battlemetricsId}: ${eventType} 间隔异常 (${interval}ms > ${threshold}ms)，可能是服务器重启`);
          await prisma.event_spawn_patterns.update({
            where: { id: pattern.id },
            data: { lastEventTime: eventTimeDate }
          });

          await this._markPredictionOccurred(serverId, battlemetricsId, eventType, eventTimeDate);
          return;
        }
      }

      // 添加新间隔到滑动窗口
      recentIntervals.push(interval);

      // 保持窗口大小
      if (recentIntervals.length > UserEventPrediction.WINDOW_SIZE) {
        recentIntervals.shift();
      }

      // 计算统计数据
      const stats = this._calculateStats(recentIntervals);

      // 更新模式数据
      await prisma.event_spawn_patterns.update({
        where: { id: pattern.id },
        data: {
          sampleCount: pattern.sampleCount + 1,
          avgInterval: stats.avg,
          stdDeviation: stats.stdDev,
          minInterval: stats.min,
          maxInterval: stats.max,
          recentIntervals: recentIntervals,
          lastEventTime: eventTimeDate
        }
      });

      logger.debug(`物理服务器 ${battlemetricsId}: ${eventType} 更新模式 (样本: ${pattern.sampleCount + 1}, 平均间隔: ${Math.round(stats.avg / 60000)}分钟)`);

      // 标记该用户的预测已发生
      await this._markPredictionOccurred(serverId, battlemetricsId, eventType, eventTimeDate);

      // 为该用户生成新预测
      if (pattern.sampleCount + 1 >= UserEventPrediction.MIN_SAMPLES) {
        await this._generatePrediction(serverId, battlemetricsId, eventType, eventTimeDate, stats);
      }

    } catch (error) {
      logger.error(`记录事件预测数据失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 记录油井冷却开始
   */
  async recordOilRigCooldown(serverId, oilRigType, triggerTime) {
    const eventType = oilRigType === 'small' ? EVENT_TYPES.SMALL_OIL_COOLDOWN : EVENT_TYPES.LARGE_OIL_COOLDOWN;
    await this.recordEvent(serverId, eventType, triggerTime);
  }

  /**
   * 计算统计数据
   * @private
   */
  _calculateStats(intervals) {
    if (!intervals || intervals.length === 0) {
      return { avg: 0, stdDev: 0, min: 0, max: 0 };
    }

    const n = intervals.length;
    const sum = intervals.reduce((a, b) => a + b, 0);
    const avg = sum / n;

    const squaredDiffs = intervals.map(x => Math.pow(x - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      avg,
      stdDev,
      min: Math.min(...intervals),
      max: Math.max(...intervals)
    };
  }

  /**
   * 生成新预测（用户级别）
   * @private
   */
  async _generatePrediction(serverId, battlemetricsId, eventType, lastEventTime, stats) {
    try {
      if (!this.notificationSettings) {
        await this.loadNotificationSettings();
      }

      if (!this.isPredictionEnabled(eventType)) {
        return;
      }

      // 计算预测时间
      const predictedTime = new Date(lastEventTime.getTime() + stats.avg);

      // 计算预测窗口（±1.5倍标准差）
      const windowMargin = stats.stdDev * 1.5;
      const windowStart = new Date(predictedTime.getTime() - windowMargin);
      const windowEnd = new Date(predictedTime.getTime() + windowMargin);

      // 计算置信度
      const cv = stats.avg > 0 ? stats.stdDev / stats.avg : 1;
      const confidenceLevel = Math.max(0, Math.min(1, 1 - cv));

      const minConfidence = this.getMinConfidence();
      if (confidenceLevel < minConfidence) {
        logger.debug(`用户 ${this.userId}: ${eventType} 置信度不足 (${(confidenceLevel * 100).toFixed(1)}% < ${(minConfidence * 100).toFixed(1)}%)，不生成预测`);
        return;
      }

      // 取消该用户之前的预测
      await prisma.event_predictions.updateMany({
        where: {
          serverId,
          userId: this.userId,
          eventType,
          status: 'PENDING'
        },
        data: {
          status: 'CANCELLED'
        }
      });

      // 清除之前的通知计时器
      const timerKey = `${serverId}_${eventType}`;
      if (this.notificationTimers.has(timerKey)) {
        clearTimeout(this.notificationTimers.get(timerKey));
        this.notificationTimers.delete(timerKey);
      }

      // 创建新预测
      const prediction = await prisma.event_predictions.create({
        data: {
          battlemetricsId,
          serverId,
          userId: this.userId,
          eventType,
          predictedTime,
          confidenceLevel,
          windowStart,
          windowEnd,
          status: 'PENDING'
        }
      });

      logger.debug(`用户 ${this.userId}: 生成 ${eventType} 预测 (时间: ${predictedTime.toLocaleString()}, 置信度: ${(confidenceLevel * 100).toFixed(1)}%)`);

      this.emit('prediction:created', {
        userId: this.userId,
        serverId,
        battlemetricsId,
        eventType,
        eventTypeName: EVENT_TYPE_NAMES[eventType],
        prediction
      });

      await this._scheduleNotification(serverId, eventType, prediction);

    } catch (error) {
      logger.error(`生成预测失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 调度提前通知
   * @private
   */
  async _scheduleNotification(serverId, eventType, prediction) {
    const advanceMinutes = this.getAdvanceMinutes();
    const advanceMs = advanceMinutes * 60 * 1000;

    const notifyTime = new Date(prediction.predictedTime).getTime() - advanceMs;
    const now = Date.now();

    if (notifyTime <= now) {
      await this._sendPredictionNotification(serverId, eventType, prediction, 0);
      return;
    }

    const delay = notifyTime - now;
    const timerKey = `${serverId}_${eventType}`;

    const timerId = setTimeout(async () => {
      await this._sendPredictionNotification(serverId, eventType, prediction, advanceMinutes);
      this.notificationTimers.delete(timerKey);
    }, delay);

    this.notificationTimers.set(timerKey, timerId);

    logger.debug(`用户 ${this.userId}: 已调度 ${eventType} 预测通知，将在 ${Math.round(delay / 60000)} 分钟后发送`);
  }

  /**
   * 发送预测通知
   * @private
   */
  async _sendPredictionNotification(serverId, eventType, prediction, minutesAhead) {
    try {
      const currentPrediction = await prisma.event_predictions.findUnique({
        where: { id: prediction.id }
      });

      if (!currentPrediction || currentPrediction.status !== 'PENDING') {
        logger.debug(`用户 ${this.userId}: ${eventType} 预测已取消或已发生，跳过通知`);
        return;
      }

      const predictedDate = new Date(prediction.predictedTime);
      const timeStr = predictedDate.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const confidenceStr = Math.round(prediction.confidenceLevel * 100);

      const messageKey = {
        CARGO_SPAWN: 'prediction_cargo',
        HELI_SPAWN: 'prediction_heli',
        SMALL_OIL_COOLDOWN: 'prediction_small_oil_ready',
        LARGE_OIL_COOLDOWN: 'prediction_large_oil_ready'
      }[eventType];

      let message = notify(messageKey, { time: timeStr, confidence: confidenceStr });
      if (!message) {
        message = `[预测] ${EVENT_TYPE_NAMES[eventType]} 可能在 ${timeStr} 出现 (置信度 ${confidenceStr}%)`;
      }

      await this.rustPlusService.sendTeamMessage(serverId, message, { isBot: true });

      await prisma.event_predictions.update({
        where: { id: prediction.id },
        data: {
          status: 'NOTIFIED',
          notifiedAt: new Date()
        }
      });

      logger.debug(`用户 ${this.userId} 服务器 ${serverId}: 已发送 ${eventType} 预测通知`);

      this.emit('prediction:notified', {
        userId: this.userId,
        serverId,
        eventType,
        eventTypeName: EVENT_TYPE_NAMES[eventType],
        predictedTime: prediction.predictedTime,
        confidence: prediction.confidenceLevel
      });

    } catch (error) {
      logger.error(`发送预测通知失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 标记预测已发生（用户级别）
   * @private
   */
  async _markPredictionOccurred(serverId, battlemetricsId, eventType, actualTime) {
    try {
      const result = await prisma.event_predictions.updateMany({
        where: {
          serverId,
          userId: this.userId,
          eventType,
          status: { in: ['PENDING', 'NOTIFIED'] }
        },
        data: {
          status: 'OCCURRED',
          actualTime
        }
      });

      if (result.count > 0) {
        const timerKey = `${serverId}_${eventType}`;
        if (this.notificationTimers.has(timerKey)) {
          clearTimeout(this.notificationTimers.get(timerKey));
          this.notificationTimers.delete(timerKey);
        }

        logger.debug(`用户 ${this.userId}: ${eventType} 预测已标记为发生`);

        this.emit('prediction:occurred', {
          userId: this.userId,
          serverId,
          eventType,
          eventTypeName: EVENT_TYPE_NAMES[eventType],
          actualTime
        });
      }
    } catch (error) {
      logger.error(`标记预测发生失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 获取服务器的活跃预测（用户级别）
   */
  async getActivePredictions(serverId) {
    try {
      const predictions = await prisma.event_predictions.findMany({
        where: {
          serverId,
          userId: this.userId,
          status: { in: ['PENDING', 'NOTIFIED'] },
          predictedTime: { gte: new Date() }
        },
        orderBy: { predictedTime: 'asc' }
      });

      return predictions.map(p => ({
        id: p.id,
        eventType: p.eventType,
        eventTypeName: EVENT_TYPE_NAMES[p.eventType],
        predictedTime: p.predictedTime,
        confidenceLevel: p.confidenceLevel,
        windowStart: p.windowStart,
        windowEnd: p.windowEnd,
        status: p.status,
        notifiedAt: p.notifiedAt
      }));
    } catch (error) {
      logger.error(`获取活跃预测失败 (用户 ${this.userId}):`, error);
      return [];
    }
  }

  /**
   * 获取服务器的学习模式（物理服务器级别，所有用户共享）
   */
  async getPatterns(serverId) {
    try {
      const battlemetricsId = await this._getBattlemetricsId(serverId);
      if (!battlemetricsId) {
        return [];
      }

      const patterns = await prisma.event_spawn_patterns.findMany({
        where: {
          battlemetricsId
        }
      });

      return patterns.map(p => ({
        eventType: p.eventType,
        eventTypeName: EVENT_TYPE_NAMES[p.eventType],
        sampleCount: p.sampleCount,
        avgInterval: p.avgInterval,
        avgIntervalMinutes: p.avgInterval ? Math.round(p.avgInterval / 60000) : null,
        stdDeviation: p.stdDeviation,
        stdDeviationMinutes: p.stdDeviation ? Math.round(p.stdDeviation / 60000) : null,
        minInterval: p.minInterval,
        maxInterval: p.maxInterval,
        lastEventTime: p.lastEventTime,
        canPredict: p.sampleCount >= UserEventPrediction.MIN_SAMPLES
      }));
    } catch (error) {
      logger.error(`获取学习模式失败 (用户 ${this.userId}):`, error);
      return [];
    }
  }

  /**
   * 重置服务器的学习数据（物理服务器级别）
   * 注意：这会影响所有连接到该物理服务器的用户
   */
  async resetPatterns(serverId) {
    try {
      const battlemetricsId = await this._getBattlemetricsId(serverId);
      if (!battlemetricsId) {
        return false;
      }

      // 删除物理服务器的模式数据
      await prisma.event_spawn_patterns.deleteMany({
        where: {
          battlemetricsId
        }
      });

      // 取消该用户的活跃预测
      await prisma.event_predictions.updateMany({
        where: {
          serverId,
          userId: this.userId,
          status: { in: ['PENDING', 'NOTIFIED'] }
        },
        data: {
          status: 'CANCELLED'
        }
      });

      // 清除相关计时器
      for (const [key, timerId] of this.notificationTimers.entries()) {
        if (key.startsWith(serverId)) {
          clearTimeout(timerId);
          this.notificationTimers.delete(key);
        }
      }

      logger.info(`物理服务器 ${battlemetricsId}: 学习数据已重置 (操作者: 用户 ${this.userId})`);

      this.emit('patterns:reset', {
        userId: this.userId,
        serverId,
        battlemetricsId
      });

      return true;
    } catch (error) {
      logger.error(`重置学习数据失败 (用户 ${this.userId}):`, error);
      return false;
    }
  }

  /**
   * 启动服务器的预测服务
   */
  async start(serverId) {
    await this.loadNotificationSettings();

    // 预热 battlemetricsId 缓存
    await this._getBattlemetricsId(serverId);

    // 恢复活跃预测的通知调度
    try {
      const activePredictions = await prisma.event_predictions.findMany({
        where: {
          serverId,
          userId: this.userId,
          status: 'PENDING',
          predictedTime: { gte: new Date() }
        }
      });

      for (const prediction of activePredictions) {
        await this._scheduleNotification(serverId, prediction.eventType, prediction);
      }

      if (activePredictions.length > 0) {
        logger.debug(`用户 ${this.userId} 服务器 ${serverId}: 恢复了 ${activePredictions.length} 个预测通知调度`);
      }
    } catch (error) {
      logger.error(`恢复预测通知失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 停止服务器的预测服务
   */
  stop(serverId) {
    for (const [key, timerId] of this.notificationTimers.entries()) {
      if (key.startsWith(serverId)) {
        clearTimeout(timerId);
        this.notificationTimers.delete(key);
      }
    }

    // 清除缓存
    this.serverBmIdCache.delete(serverId);

    logger.debug(`用户 ${this.userId} 服务器 ${serverId}: 预测服务已停止`);
  }

  /**
   * 停止所有预测服务
   */
  stopAll() {
    for (const [key, timerId] of this.notificationTimers.entries()) {
      clearTimeout(timerId);
    }
    this.notificationTimers.clear();
    this.serverBmIdCache.clear();

    logger.debug(`用户 ${this.userId}: 所有预测服务已停止`);
  }
}

export default UserEventPrediction;
export { EVENT_TYPES, EVENT_TYPE_NAMES };
