/**
 * 昼夜自动提醒服务（用户级别）
 * 天亮：从配置的分钟数开始，每分钟提醒直到天亮
 * 天黑：从配置的分钟数开始，每分钟提醒直到天黑
 */

import db from '../lib/db.js';
import logger from '../utils/logger.js';

// 默认通知设置
const DEFAULT_SETTINGS = {
  day_night_enabled: true,
  day_notify_minutes: 5,
  night_notify_minutes: 8,
};

class DayNightNotifier {
  constructor(userId, rustPlusService) {
    if (!userId) {
      throw new Error('userId 是必需的');
    }
    if (!rustPlusService) {
      throw new Error('rustPlusService 是必需的');
    }

    this.userId = userId;
    this.rustPlusService = rustPlusService;
    this.timers = new Map(); // serverId -> timer
    this.lastNotifiedMinute = new Map(); // serverId -> { type: 'day'|'night', minute: number }
    this.checkInterval = 60 * 1000; // 每分钟检查一次
    this.notificationSettings = null;
  }

  /**
   * 加载用户的通知设置
   */
  async loadNotificationSettings() {
    try {
      const [rows] = await db.query(
        'SELECT * FROM notification_settings WHERE userId = ?',
        [this.userId]
      );

      let settings = rows[0];

      if (!settings) {
        await db.query(
          'INSERT INTO notification_settings (userId, settings, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
          [this.userId, JSON.stringify(DEFAULT_SETTINGS)]
        );
        settings = { settings: DEFAULT_SETTINGS };
      }

      // 解析 JSON 字符串
      const parsedSettings = typeof settings.settings === 'string'
        ? JSON.parse(settings.settings)
        : settings.settings;

      this.notificationSettings = {
        ...DEFAULT_SETTINGS,
        ...(typeof parsedSettings === 'object' ? parsedSettings : {})
      };

      logger.debug(`用户 ${this.userId} 的昼夜提醒设置已加载`);
    } catch (error) {
      logger.error(`加载用户 ${this.userId} 的昼夜提醒设置失败:`, error);
      this.notificationSettings = DEFAULT_SETTINGS;
    }
  }

  /**
   * 获取昼夜提醒配置
   */
  getConfig() {
    const settings = this.notificationSettings || DEFAULT_SETTINGS;
    return {
      enabled: settings.day_night_enabled !== false,
      dayNotifyStart: settings.day_notify_minutes || 5,
      nightNotifyStart: settings.night_notify_minutes || 8,
    };
  }

  /**
   * 启动某个服务器的昼夜提醒
   */
  async start(serverId) {
    if (this.timers.has(serverId)) {
      logger.debug(`⏰ 服务器 ${serverId} 的昼夜提醒已在运行 (用户 ${this.userId})`);
      return;
    }

    // 加载设置（如果还未加载）
    if (!this.notificationSettings) {
      await this.loadNotificationSettings();
    }

    logger.info(`⏰ 启动服务器 ${serverId} 的昼夜提醒 (用户 ${this.userId})`);

    const timer = setInterval(async () => {
      try {
        await this.checkAndNotify(serverId);
      } catch (error) {
        const errorMessage = error?.message || JSON.stringify(error) || String(error);
        if (errorMessage.includes('not_found') || errorMessage.includes('服务器未连接') || errorMessage.includes('Timeout')) {
          return;
        }
        logger.error(`[昼夜提醒] 检查失败 ${serverId} (用户 ${this.userId}): ${errorMessage}`);
      }
    }, this.checkInterval);

    this.timers.set(serverId, timer);
  }

  /**
   * 停止某个服务器的昼夜提醒
   */
  stop(serverId) {
    const timer = this.timers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(serverId);
      this.lastNotifiedMinute.delete(serverId);
      logger.info(`⏹️ 已停止服务器 ${serverId} 的昼夜提醒 (用户 ${this.userId})`);
    }
  }

  /**
   * 刷新通知设置（当用户修改设置时调用）
   */
  async refreshSettings() {
    await this.loadNotificationSettings();
  }

  /**
   * 检查并发送通知
   */
  async checkAndNotify(serverId) {
    // 每次检查时读取最新配置
    const config = this.getConfig();

    // 如果昼夜提醒被禁用，跳过
    if (!config.enabled) {
      return;
    }

    const timeInfo = await this.rustPlusService.getTime(serverId);
    const currentTime = timeInfo.time || 0;
    const sunrise = timeInfo.sunrise || 6;
    const sunset = timeInfo.sunset || 18;
    const dayLengthMinutes = timeInfo.dayLengthMinutes || 45;

    const isDaytime = currentTime >= sunrise && currentTime < sunset;

    // 计算距离下次昼夜变化的时间（游戏时间）
    let nextChangeTime;
    let changeType;

    if (isDaytime) {
      nextChangeTime = sunset;
      changeType = 'night';
    } else {
      if (currentTime < sunrise) {
        nextChangeTime = sunrise;
      } else {
        nextChangeTime = 24 + sunrise;
      }
      changeType = 'day';
    }

    // 游戏时间差（小时）
    const gameTimeDiff = nextChangeTime - currentTime;

    // 转换为真实时间（分钟）
    const realMinutes = Math.floor(gameTimeDiff * (dayLengthMinutes / 24));

    // 根据类型获取通知开始时间
    const notifyStart = changeType === 'day' ? config.dayNotifyStart : config.nightNotifyStart;

    // 检查是否在通知范围内
    if (realMinutes <= notifyStart && realMinutes > 0) {
      const lastNotify = this.lastNotifiedMinute.get(serverId);

      // 避免同一分钟重复发送
      if (!lastNotify || lastNotify.type !== changeType || lastNotify.minute !== realMinutes) {
        let message;
        if (changeType === 'night') {
          message = `${realMinutes} 分钟后 天黑`;
        } else {
          message = `${realMinutes} 分钟后 天亮`;
        }

        logger.info(`🌓 [昼夜提醒] ${message} (用户 ${this.userId})`);
        await this.rustPlusService.sendTeamMessage(serverId, message, { isBot: true });

        this.lastNotifiedMinute.set(serverId, { type: changeType, minute: realMinutes });
      }
    }

    // 如果距离变化时间超过通知开始时间，重置通知状态
    if (realMinutes > notifyStart + 2) {
      this.lastNotifiedMinute.delete(serverId);
    }
  }

  /**
   * 停止所有服务器的昼夜提醒
   */
  stopAll() {
    for (const serverId of this.timers.keys()) {
      this.stop(serverId);
    }
  }
}

export default DayNightNotifier;
