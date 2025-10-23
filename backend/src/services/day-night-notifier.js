/**
 * 昼夜自动提醒服务
 * 在距离天黑/天亮 8 分钟时自动发送通知
 */

class DayNightNotifier {
  constructor(rustPlusService) {
    this.rustPlusService = rustPlusService;
    this.timers = new Map(); // serverId -> timer
    this.lastNotified = new Map(); // serverId -> 'day' | 'night'
    this.checkInterval = 60 * 1000; // 每分钟检查一次
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
      this.lastNotified.delete(serverId);
      console.log(`⏹️  已停止服务器 ${serverId} 的昼夜提醒`);
    }
  }

  /**
   * 检查并发送通知
   */
  async checkAndNotify(serverId) {
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

    // 如果距离变化时间在 8 分钟内，且上次通知类型不同，则发送通知
    if (realMinutes <= 8 && realMinutes > 0) {
      const lastType = this.lastNotified.get(serverId);

      if (lastType !== changeType) {
        // 发送通知
        let message;
        if (changeType === 'night') {
          message = `距离天黑在 ${realMinutes} 分钟后`;
        } else {
          message = `距离天亮在 ${realMinutes} 分钟后`;
        }

        console.log(`🌓 [昼夜提醒] ${message}`);
        await this.rustPlusService.sendTeamMessage(serverId, message);

        // 记录本次通知类型
        this.lastNotified.set(serverId, changeType);
      }
    }

    // 如果距离变化时间超过 10 分钟，重置通知状态
    if (realMinutes > 10) {
      this.lastNotified.delete(serverId);
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
