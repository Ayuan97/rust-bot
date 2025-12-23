/**
 * 昼夜自动提醒服务
 * 天亮：从配置的分钟数开始，每分钟提醒直到天亮
 * 天黑：从配置的分钟数开始，每分钟提醒直到天黑
 */

import { getNotificationSettings } from '../routes/settings.routes.js';

class DayNightNotifier {
  constructor(rustPlusService) {
    this.rustPlusService = rustPlusService;
    this.timers = new Map(); // serverId -> timer
    this.lastNotifiedMinute = new Map(); // serverId -> { type: 'day'|'night', minute: number }
    this.checkInterval = 60 * 1000; // 每分钟检查一次
  }

  /**
   * 获取昼夜提醒配置
   */
  getConfig() {
    const settings = getNotificationSettings();
    return {
      enabled: settings.day_night_enabled !== false,
      dayNotifyStart: settings.day_notify_minutes || 5,
      nightNotifyStart: settings.night_notify_minutes || 8,
    };
  }

  /**
   * 启动某个服务器的昼夜提醒
   */
  start(serverId) {
    if (this.timers.has(serverId)) {
      console.log(`⏰ 服务器 ${serverId} 的昼夜提醒已在运行`);
      return;
    }

    console.log(`⏰ 启动服务器 ${serverId} 的昼夜提醒 (检查间隔: ${this.checkInterval/1000}秒)`);

    const timer = setInterval(async () => {
      try {
        await this.checkAndNotify(serverId);
      } catch (error) {
        const errorMessage = error?.message || JSON.stringify(error) || String(error);
        if (!errorMessage.includes('服务器未连接')) {
          console.error(`❌ 昼夜提醒检查失败 ${serverId}:`, error);
        }
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
      console.log(`⏹️  已停止服务器 ${serverId} 的昼夜提醒`);
    }
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
    const dayLengthMinutes = timeInfo.dayLengthMinutes || 45; // 默认45分钟一天

    const isDaytime = currentTime >= sunrise && currentTime < sunset;

    // 计算距离下次昼夜变化的时间（游戏时间）
    let nextChangeTime;
    let changeType; // 'night' 或 'day'

    if (isDaytime) {
      // 白天，计算距离天黑的时间
      nextChangeTime = sunset;
      changeType = 'night';
    } else {
      // 夜晚，计算距离天亮的时间
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
    // 公式: 真实分钟 = 游戏时间差(小时) × (一天真实分钟数 / 24小时)
    const realMinutes = Math.floor(gameTimeDiff * (dayLengthMinutes / 24));

    // 根据类型获取通知开始时间（从配置读取）
    const notifyStart = changeType === 'day' ? config.dayNotifyStart : config.nightNotifyStart;

    // 检查是否在通知范围内（realMinutes <= notifyStart 且 > 0）
    if (realMinutes <= notifyStart && realMinutes > 0) {
      const lastNotify = this.lastNotifiedMinute.get(serverId);

      // 避免同一分钟重复发送：检查类型和分钟数是否相同
      if (!lastNotify || lastNotify.type !== changeType || lastNotify.minute !== realMinutes) {
        // 发送通知（不使用表情符号）
        let message;
        if (changeType === 'night') {
          message = `${realMinutes} 分钟后 天黑`;
        } else {
          message = `${realMinutes} 分钟后 天亮`;
        }

        console.log(`🌓 [昼夜提醒] ${message}`);
        await this.rustPlusService.sendTeamMessage(serverId, message);

        // 记录本次通知
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
