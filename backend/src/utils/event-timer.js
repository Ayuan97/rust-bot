/**
 * 事件计时器工具类
 * 用于管理游戏事件的倒计时
 */

class EventTimer {
  constructor(name, serverId, duration, callback) {
    this.name = name;
    this.serverId = serverId;
    this.duration = duration;      // 总时长（毫秒）
    this.callback = callback;      // 回调函数
    this.startTime = null;         // 开始时间
    this.timeout = null;           // setTimeout 引用
    this.warningCallbacks = [];    // 警告回调 [{time: ms, callback: fn, triggered: bool}]
  }

  /**
   * 启动计时器
   */
  start() {
    if (this.timeout) {
      console.log(`⏰ 计时器 ${this.name} 已在运行`);
      return;
    }

    this.startTime = Date.now();

    console.log(`⏰ 启动计时器: ${this.name} (时长: ${Math.floor(this.duration / 60000)}分钟)`);

    this.timeout = setTimeout(() => {
      console.log(`⏰ 计时器触发: ${this.name}`);
      if (this.callback) {
        this.callback();
      }
      this.reset();
    }, this.duration);

    // 启动警告检查
    this.startWarningCheck();
  }

  /**
   * 停止计时器
   */
  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.warningInterval) {
      clearInterval(this.warningInterval);
      this.warningInterval = null;
    }

    console.log(`⏹️  停止计时器: ${this.name}`);
    this.reset();
  }

  /**
   * 重启计时器
   */
  restart() {
    this.stop();
    this.start();
  }

  /**
   * 添加警告回调（在剩余时间 <= warningTime 时触发）
   */
  addWarning(warningTime, callback) {
    this.warningCallbacks.push({
      time: warningTime,
      callback: callback,
      triggered: false
    });
  }

  /**
   * 启动警告检查（每10秒检查一次）
   */
  startWarningCheck() {
    this.warningInterval = setInterval(() => {
      const timeLeft = this.getTimeLeft();

      for (const warning of this.warningCallbacks) {
        if (!warning.triggered && timeLeft <= warning.time && timeLeft > 0) {
          console.log(`⚠️  计时器警告: ${this.name} (剩余 ${Math.floor(timeLeft / 60000)} 分钟)`);
          warning.triggered = true;
          if (warning.callback) {
            warning.callback(timeLeft);
          }
        }
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getTimeLeft() {
    if (!this.startTime || !this.timeout) {
      return 0;
    }

    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.duration - elapsed);
  }

  /**
   * 获取剩余分钟数
   */
  getMinutesLeft() {
    return Math.floor(this.getTimeLeft() / 60000);
  }

  /**
   * 检查是否正在运行
   */
  isRunning() {
    return !!this.timeout;
  }

  /**
   * 检查是否已完成
   */
  isFinished() {
    return this.getTimeLeft() === 0 && !this.timeout;
  }

  /**
   * 重置计时器
   */
  reset() {
    this.startTime = null;
    this.timeout = null;
    this.warningCallbacks.forEach(w => w.triggered = false);

    if (this.warningInterval) {
      clearInterval(this.warningInterval);
      this.warningInterval = null;
    }
  }
}

/**
 * 计时器管理器
 */
class EventTimerManager {
  constructor() {
    this.timers = new Map(); // key: serverId_timerName
  }

  /**
   * 获取或创建计时器
   */
  getTimer(name, serverId, duration, callback) {
    const key = `${serverId}_${name}`;

    if (!this.timers.has(key)) {
      const timer = new EventTimer(name, serverId, duration, callback);
      this.timers.set(key, timer);
      console.log(`✅ 创建计时器: ${name} (服务器: ${serverId})`);
    }

    return this.timers.get(key);
  }

  /**
   * 启动计时器
   */
  startTimer(name, serverId, duration, callback) {
    const timer = this.getTimer(name, serverId, duration, callback);
    timer.start();
    return timer;
  }

  /**
   * 停止计时器
   */
  stopTimer(name, serverId) {
    const key = `${serverId}_${name}`;
    const timer = this.timers.get(key);

    if (timer) {
      timer.stop();
      this.timers.delete(key);
      return true;
    }

    return false;
  }

  /**
   * 检查计时器是否存在且运行中
   */
  isTimerRunning(name, serverId) {
    const key = `${serverId}_${name}`;
    const timer = this.timers.get(key);
    return timer ? timer.isRunning() : false;
  }

  /**
   * 获取计时器剩余时间
   */
  getTimeLeft(name, serverId) {
    const key = `${serverId}_${name}`;
    const timer = this.timers.get(key);
    return timer ? timer.getTimeLeft() : 0;
  }

  /**
   * 停止某服务器的所有计时器
   */
  stopAllTimers(serverId) {
    const keysToDelete = [];

    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(`${serverId}_`)) {
        timer.stop();
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.timers.delete(key));
    console.log(`⏹️  停止服务器 ${serverId} 的 ${keysToDelete.length} 个计时器`);
  }

  /**
   * 获取所有活跃计时器
   */
  getActiveTimers(serverId) {
    const activeTimers = [];

    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(`${serverId}_`) && timer.isRunning()) {
        activeTimers.push({
          name: timer.name,
          timeLeft: timer.getTimeLeft(),
          minutesLeft: timer.getMinutesLeft()
        });
      }
    }

    return activeTimers;
  }
}

// 导出单例
export default new EventTimerManager();
