/**
 * 设备自动化服务
 * 支持日夜自动开关、在线触发等自动化模式
 * 参考 rustplusplus 的 smartSwitchHandler.js 实现
 */

import { EventEmitter } from 'events';
import storage from '../models/storage.model.js';

// 自动化模式定义
export const AutoMode = {
  NONE: 0,          // 无自动化（手动控制）
  DAY_ON: 1,        // 白天开启，夜晚关闭
  NIGHT_ON: 2,      // 夜晚开启，白天关闭
  ALWAYS_ON: 3,     // 始终开启
  ALWAYS_OFF: 4,    // 始终关闭
  // 5, 6 为邻近模式，暂不实现
  ONLINE_ON: 7,     // 有人在线时开启
  ONLINE_OFF: 8     // 有人在线时关闭
};

class AutomationService extends EventEmitter {
  constructor(rustPlusService) {
    super();
    this.rustPlusService = rustPlusService;
    this.pollIntervals = new Map();         // serverId -> interval
    this.previousTimeState = new Map();     // serverId -> { isDay: boolean }
    this.interactionSwitches = new Map();   // serverId -> Set(entityId) 防止循环触发
    this.pollIntervalMs = 30000;            // 30秒轮询间隔
  }

  /**
   * 启动服务器的自动化轮询
   */
  start(serverId) {
    if (this.pollIntervals.has(serverId)) {
      return; // 已启动
    }

    console.log(`🤖 自动化服务启动: ${serverId}`);

    // 初始化交互开关集合
    this.interactionSwitches.set(serverId, new Set());

    // 首次立即执行一次检查
    this.checkAutomation(serverId).catch(e => {
      console.error(`❌ 自动化检查失败 (${serverId}):`, e.message);
    });

    // 设置定时轮询
    const interval = setInterval(async () => {
      try {
        await this.checkAutomation(serverId);
      } catch (e) {
        console.error(`❌ 自动化检查失败 (${serverId}):`, e.message);
      }
    }, this.pollIntervalMs);

    this.pollIntervals.set(serverId, interval);
  }

  /**
   * 停止服务器的自动化轮询
   */
  stop(serverId) {
    const interval = this.pollIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(serverId);
      console.log(`🛑 自动化服务停止: ${serverId}`);
    }
    this.previousTimeState.delete(serverId);
    this.interactionSwitches.delete(serverId);
  }

  /**
   * 停止所有自动化
   */
  stopAll() {
    for (const serverId of this.pollIntervals.keys()) {
      this.stop(serverId);
    }
  }

  /**
   * 检查并执行自动化规则
   */
  async checkAutomation(serverId) {
    // 获取有自动化配置的设备
    const devices = storage.getDevicesWithAutoMode(serverId);
    if (!devices || devices.length === 0) {
      return;
    }

    // 获取当前时间信息
    let timeInfo = null;
    let teamInfo = null;

    try {
      timeInfo = await this.rustPlusService.getTime(serverId);
    } catch (e) {
      console.warn(`⚠️ 获取游戏时间失败 (${serverId}):`, e.message);
      return;
    }

    // 检测日夜变化
    const prevState = this.previousTimeState.get(serverId) || { isDay: null };
    const sunrise = timeInfo.sunrise || 6.5;
    const sunset = timeInfo.sunset || 18.5;
    const currentTime = timeInfo.time || 0;
    const isDay = currentTime >= sunrise && currentTime < sunset;
    const turnedDay = prevState.isDay === false && isDay === true;
    const turnedNight = prevState.isDay === true && isDay === false;
    this.previousTimeState.set(serverId, { isDay });

    // 如果需要检查在线状态的设备存在，获取队伍信息
    const needsTeamInfo = devices.some(d => d.auto_mode === AutoMode.ONLINE_ON || d.auto_mode === AutoMode.ONLINE_OFF);
    if (needsTeamInfo) {
      try {
        teamInfo = await this.rustPlusService.getTeamInfo(serverId);
      } catch (e) {
        console.warn(`⚠️ 获取队伍信息失败 (${serverId}):`, e.message);
      }
    }

    // 处理每个设备
    for (const device of devices) {
      try {
        await this.processDevice(serverId, device, {
          isDay,
          turnedDay,
          turnedNight,
          teamInfo
        });
      } catch (e) {
        console.error(`❌ 自动化处理失败 ${device.name}:`, e.message);
        // 标记设备不可达
        storage.updateDeviceReachable(serverId, device.entity_id, false);
      }
    }
  }

  /**
   * 处理单个设备的自动化
   */
  async processDevice(serverId, device, ctx) {
    const shouldBeOn = this.evaluateAutoMode(device, ctx);

    // shouldBeOn 为 null 表示不需要改变状态
    if (shouldBeOn === null) {
      return;
    }

    // 获取当前状态
    let currentValue = false;
    try {
      const info = await this.rustPlusService.getEntityInfo(serverId, device.entity_id);
      currentValue = info?.payload?.value || false;

      // 更新设备可达状态
      if (!device.reachable) {
        storage.updateDeviceReachable(serverId, device.entity_id, true);
      }
    } catch (e) {
      console.warn(`⚠️ 设备不可达 ${device.name}:`, e.message);
      storage.updateDeviceReachable(serverId, device.entity_id, false);
      return;
    }

    // 如果状态需要改变
    if (shouldBeOn !== currentValue) {
      // 标记为交互中，防止循环触发
      const interactions = this.interactionSwitches.get(serverId) || new Set();
      interactions.add(device.entity_id);
      this.interactionSwitches.set(serverId, interactions);

      try {
        if (shouldBeOn) {
          await this.rustPlusService.turnSmartSwitchOn(serverId, device.entity_id);
        } else {
          await this.rustPlusService.turnSmartSwitchOff(serverId, device.entity_id);
        }

        console.log(`🤖 自动化: ${device.name} -> ${shouldBeOn ? '开启' : '关闭'} (模式${device.auto_mode})`);

        // 发送事件
        this.emit('automation:executed', {
          serverId,
          entityId: device.entity_id,
          name: device.name,
          value: shouldBeOn,
          mode: device.auto_mode
        });
      } finally {
        // 延迟移除交互标记（避免事件循环）
        setTimeout(() => {
          interactions.delete(device.entity_id);
        }, 5000);
      }
    }
  }

  /**
   * 评估设备应该开还是关
   * @returns {boolean|null} true=开, false=关, null=不改变
   */
  evaluateAutoMode(device, ctx) {
    switch (device.auto_mode) {
      case AutoMode.DAY_ON: // 白天开启
        if (ctx.turnedDay) return true;
        if (ctx.turnedNight) return false;
        return null;

      case AutoMode.NIGHT_ON: // 夜晚开启
        if (ctx.turnedDay) return false;
        if (ctx.turnedNight) return true;
        return null;

      case AutoMode.ALWAYS_ON: // 始终开启
        return true;

      case AutoMode.ALWAYS_OFF: // 始终关闭
        return false;

      case AutoMode.ONLINE_ON: // 有人在线时开启
        if (!ctx.teamInfo) return null;
        return ctx.teamInfo.members?.some(m => m.isOnline) || false;

      case AutoMode.ONLINE_OFF: // 有人在线时关闭（全部离线时开启）
        if (!ctx.teamInfo) return null;
        return !(ctx.teamInfo.members?.some(m => m.isOnline) || false);

      default:
        return null;
    }
  }

  /**
   * 检查实体是否正在被自动化操作
   */
  isInteracting(serverId, entityId) {
    const interactions = this.interactionSwitches.get(serverId);
    return interactions ? interactions.has(entityId) : false;
  }
}

export default AutomationService;
