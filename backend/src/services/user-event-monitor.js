/**
 * UserEventMonitor - 用户级别的事件监控服务
 * 监听特定用户服务器的游戏事件
 */

import EventEmitter from 'events';
import db from '../lib/db.js';
import { AppMarkerType, EventTiming, EventType } from '../utils/event-constants.js';
import { formatPosition, getDistance } from '../utils/coordinates.js';
import { notify, formatDuration } from '../utils/messages.js';
import EventTimerManager from '../utils/event-timer.js';
import { getItemName, isImportantItem } from '../utils/item-info.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import steamService from './steam.service.js';
import globalManager from './global-manager.service.js';

// 刷新间隔
const PLAYER_DATA_REFRESH_INTERVAL = 10 * 60 * 1000; // 10分钟刷新一次 Steam 数据
const PLAYER_STATS_SNAPSHOT_INTERVAL = 24 * 60 * 60 * 1000; // 每天 00:00 快照（逻辑上在 checkPlayerStats 中处理）

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  player_death: true,
  player_online: true,
  player_offline: true,
  player_afk: true,
  player_afk_minutes: 3,        // AFK 触发时间（分钟），默认 3 分钟
  player_afk_template: '',      // AFK 消息模板（空则使用默认）
  cargo_spawn: true,
  cargo_dock: true,
  cargo_egress: true,
  cargo_leave: false,
  heli_spawn: true,
  heli_downed: true,
  heli_leave: false,
  oil_rig_triggered: true,
  oil_rig_warning: true,
  oil_rig_unlocked: true,
  crate_spawn: false,
  ch47_spawn: false,
  vending_new: false,
  day_night_enabled: true,
  day_notify_minutes: 5,
  night_notify_minutes: 8,
  // 预测通知设置
  prediction_enabled: false,           // 预测功能总开关（默认关闭，需用户主动开启）
  prediction_cargo_enabled: true,      // 货船预测
  prediction_heli_enabled: true,       // 直升机预测
  prediction_oil_rig_enabled: true,    // 油井冷却预测
  prediction_advance_minutes: 5,       // 提前通知时间（分钟）
  prediction_min_confidence: 0.6,      // 最低置信度（0-1）
};

class UserEventMonitor extends EventEmitter {
  constructor(userId, rustPlusService) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    if (!rustPlusService) {
      throw new Error('rustPlusService 是必需的');
    }

    this.userId = userId;
    this.rustPlusService = rustPlusService;
    this.pollIntervals = new Map(); // serverId -> interval
    this.previousMarkers = new Map(); // serverId -> markers array
    this.eventData = new Map(); // serverId -> event-specific data
    this.monuments = new Map(); // serverId -> monuments array

    // 缓存用户的通知设置
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
        // 创建默认设置
        await db.query(
          'INSERT INTO notification_settings (userId, settings, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
          [this.userId, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)]
        );
        settings = { userId: this.userId, settings: DEFAULT_NOTIFICATION_SETTINGS };
      }

      // 合并默认设置
      const settingsObj = settings.settings
        ? (typeof settings.settings === 'string' ? JSON.parse(settings.settings) : settings.settings)
        : {};

      this.notificationSettings = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...settingsObj
      };

      logger.debug(`用户 ${this.userId} 的通知设置已加载`);
    } catch (error) {
      logger.error(`加载用户 ${this.userId} 的通知设置失败:`, error);
      this.notificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
    }
  }

  /**
   * 检查通知是否启用（用户级别）
   */
  isNotificationEnabled(key) {
    if (!this.notificationSettings) {
      return DEFAULT_NOTIFICATION_SETTINGS[key] || false;
    }
    return this.notificationSettings[key] || false;
  }

  /**
   * 保存事件到数据库（用户级别的 event_logs）
   * EventLog 通过 Server 关系关联用户，不直接包含 userId
   */
  async saveEventLog(serverId, eventType, eventData) {
    // 映射内部事件类型到数据库 Enum 类型 (event_logs_eventType)
    const eventTypeMap = {
      'player:died': 'PLAYER_DEATH',
      'player:online': 'PLAYER_ONLINE',
      'player:offline': 'PLAYER_OFFLINE',
      'player:afk': 'PLAYER_AFK',
      'player:afk_returned': 'PLAYER_RETURN',
      'cargo:spawn': 'CARGO_SPAWN',
      'cargo:leave': 'CARGO_LEAVE',
      'patrol_heli:spawn': 'HELI_SPAWN',
      'patrol_heli:downed': 'HELI_DOWN',
      'small_oil_rig:triggered': 'OIL_RIG_TRIGGERED',
      'large_oil_rig:triggered': 'OIL_RIG_TRIGGERED',
      'small_oil_rig:crate_unlocked': 'OIL_RIG_UNLOCKED',
      'large_oil_rig:crate_unlocked': 'OIL_RIG_UNLOCKED',
      'ch47:spawn': 'CHINOOK_SPAWN',
      'alarm:triggered': 'ALARM_TRIGGERED',
      'entity:changed': 'ENTITY_CHANGED',
      'server:connected': 'SERVER_CONNECTED',
      'server:disconnected': 'SERVER_DISCONNECTED',
      'fcm:connected': 'FCM_CONNECTED',
      'fcm:disconnected': 'FCM_DISCONNECTED'
    };

    const dbEventType = eventTypeMap[eventType];

    // 如果不在映射表中，则不保存
    if (!dbEventType) {
      return;
    }

    try {
      await db.query(
        `INSERT INTO event_logs (id, serverId, userId, eventType, eventData, createdAt)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          uuidv4(),
          serverId,
          this.userId,
          dbEventType,
          typeof eventData === 'string' ? eventData : JSON.stringify(eventData)
        ]
      );
    } catch (error) {
      logger.error(`保存事件日志失败 (用户 ${this.userId}):`, error);
    }
  }

  /**
   * 启动某个服务器的事件监控
   */
  async start(serverId) {
    if (this.pollIntervals.has(serverId)) {
      return;
    }

    // 过滤掉 FCM 占位符
    if (serverId && String(serverId).startsWith('fcm-')) {
      logger.debug(`⏩ 用户 ${this.userId} 事件监控跳过占位符服务器: ${serverId}`);
      return;
    }

    // 加载通知设置（如果还未加载）
    if (!this.notificationSettings) {
      await this.loadNotificationSettings();
    }

    logger.server(serverId, `🎮 事件监控已启动 (用户 ${this.userId})`);

    // 初始化事件数据
    this.eventData.set(serverId, {
      cargoShipTracers: new Map(),
      patrolHeliTracers: new Map(),
      ch47Tracers: new Map(),
      ch47Types: new Map(),           // CH47 类型追踪: id -> 'oil_rig' | 'crate'
      ch47CrateDropInfo: null,        // CH47 投放箱子信息: { time, x, y, position }
      cargoShipDockedStatus: new Map(),
      lastEvents: {
        cargoShipSpawn: null,
        cargoShipLeave: null,
        smallOilRigTriggered: null,
        smallOilRigCrateUnlocked: null,
        largeOilRigTriggered: null,
        largeOilRigCrateUnlocked: null,
        patrolHeliSpawn: null,
        patrolHeliDowned: null,
        patrolHeliLeave: null,
        ch47Spawn: null,
        ch47CrateDrop: null,          // CH47 投放箱子时间
        lockedCrateSpawn: null
      },
      knownVendingMachines: new Map(),
      isFirstPoll: true,
      teamMembers: new Map(),
      isFirstTeamPoll: true
    });

    // 获取古迹位置
    await this.loadMonuments(serverId);

    // 启动轮询
    const interval = setInterval(async () => {
      try {
        await this.checkMapMarkers(serverId);
      } catch (error) {
        const errorStr = JSON.stringify(error) || String(error);
        if (errorStr.includes('not_found')) {
          return;
        }

        const errorMessage = error?.message || errorStr;
        if (errorMessage.includes('Timeout reached') ||
          errorMessage.includes('服务器未连接')) {
          return;
        }

        console.error(`❌ 事件监控检查失败 ${serverId} (用户 ${this.userId}):`, error);
      }
    }, EventTiming.MAP_MARKERS_POLL_INTERVAL);

    this.pollIntervals.set(serverId, interval);

    // 启动玩家数据刷新轮询
    console.log(`[Steam] ⏰ 启动玩家数据定时刷新 (每 ${PLAYER_DATA_REFRESH_INTERVAL / 60000} 分钟)`);
    const playerInterval = setInterval(async () => {
      console.log(`[Steam] ⏰ 定时刷新触发...`);
      try {
        await this.refreshPlayerData(serverId);
      } catch (error) {
        console.error(`[Steam] ❌ 定时刷新失败 ${serverId}:`, error.message);
      }
    }, PLAYER_DATA_REFRESH_INTERVAL);

    this.pollIntervals.set(`${serverId}:players`, playerInterval);

    // 初始刷新一次
    console.log(`[Steam] 🚀 执行初始刷新...`);
    this.refreshPlayerData(serverId).catch(e => {
      console.error(`[Steam] ❌ 初始刷新失败:`, e.message);
    });
  }

  /**
   * 停止某个服务器的事件监控
   */
  stop(serverId) {
    const interval = this.pollIntervals.get(serverId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(serverId);
      this.previousMarkers.delete(serverId);
      this.eventData.delete(serverId);
      EventTimerManager.stopAllTimers(serverId);

      // 清理玩家刷新定时器
      const playerInterval = this.pollIntervals.get(`${serverId}:players`);
      if (playerInterval) {
        clearInterval(playerInterval);
        this.pollIntervals.delete(`${serverId}:players`);
      }

      logger.server(serverId, `⏹️ 事件监控已停止 (用户 ${this.userId})`);
    }
  }

  /**
   * 停止所有服务器的监控
   */
  stopAll() {
    for (const serverId of this.pollIntervals.keys()) {
      this.stop(serverId);
    }
  }

  /**
   * 加载古迹位置（带重试机制）
   */
  async loadMonuments(serverId, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];

    try {
      const map = await this.rustPlusService.getMap(serverId);
      if (map && map.monuments) {
        this.monuments.set(serverId, map.monuments);
        logger.server(serverId, `🗺️ 加载古迹: ${map.monuments.length} 个`);
      }
    } catch (error) {
      const errorStr = JSON.stringify(error) || String(error);

      if (errorStr.includes('not_found')) {
        logger.server(serverId, `ℹ️ 跳过加载古迹（玩家未在服务器内）`);
        return;
      }

      if (errorStr.includes('Timeout') && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] || 4000;
        logger.server(serverId, `⏳ 加载古迹超时，${delay / 1000}秒后重试 (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.loadMonuments(serverId, retryCount + 1);
      }

      if (retryCount >= MAX_RETRIES) {
        logger.server(serverId, `❌ 加载古迹失败（已重试${MAX_RETRIES}次）`);
      } else {
        console.error(`❌ 加载古迹位置失败:`, error);
      }
    }
  }

  /**
   * 检查地图标记变化
   */
  async checkMapMarkers(serverId) {
    const rustplus = this.rustPlusService.connections.get(serverId);
    if (!rustplus) {
      throw new Error('服务器未连接');
    }

    // 清理过期的追踪路径
    const eventData = this.eventData.get(serverId);
    if (eventData) {
      const expiryTime = Date.now() - 2 * 60 * 60 * 1000;
      for (const [id, tracer] of eventData.cargoShipTracers.entries()) {
        if (tracer.length > 0 && tracer[tracer.length - 1].time < expiryTime) {
          eventData.cargoShipTracers.delete(id);
          eventData.cargoShipDockedStatus.delete(id);
        }
      }
      for (const [id, tracer] of eventData.patrolHeliTracers.entries()) {
        if (tracer.length > 0 && tracer[tracer.length - 1].time < expiryTime) {
          eventData.patrolHeliTracers.delete(id);
        }
      }
      for (const [id, tracer] of eventData.ch47Tracers.entries()) {
        if (tracer.length > 0 && tracer[tracer.length - 1].time < expiryTime) {
          eventData.ch47Tracers.delete(id);
        }
      }
    }

    // 获取当前标记
    const response = await this.rustPlusService.getMapMarkers(serverId);
    const currentMarkers = response.markers || [];

    // 获取上次的标记
    const previousMarkers = this.previousMarkers.get(serverId) || [];

    // 检测各类事件
    await this.checkCargoShips(serverId, currentMarkers, previousMarkers);
    await this.checkPatrolHelicopters(serverId, currentMarkers, previousMarkers);
    await this.checkCH47s(serverId, currentMarkers, previousMarkers);
    await this.checkLockedCrates(serverId, currentMarkers, previousMarkers);
    await this.checkVendingMachines(serverId, currentMarkers, previousMarkers);
    await this.checkTeamInfo(serverId);

    // 更新缓存
    this.previousMarkers.set(serverId, currentMarkers);

    // 标记首次轮询已完成
    if (eventData && eventData.isFirstPoll) {
      eventData.isFirstPoll = false;
    }
  }

  /**
   * 检测货船事件
   */
  async checkCargoShips(serverId, currentMarkers, previousMarkers) {
    const currentShips = currentMarkers.filter(m => m.type === AppMarkerType.CargoShip);
    const previousShips = previousMarkers.filter(m => m.type === AppMarkerType.CargoShip);
    const eventData = this.eventData.get(serverId);

    // 新刷新的货船
    const newShips = currentShips.filter(c =>
      !previousShips.some(p => p.id === c.id)
    );

    for (const ship of newShips) {
      // 首次轮询时跳过事件触发，避免服务重启时误判已存在的货船为新刷新
      if (eventData.isFirstPoll) {
        if (!eventData.cargoShipTracers.has(ship.id)) {
          eventData.cargoShipTracers.set(ship.id, []);
        }
        continue;
      }

      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(ship.x, ship.y, mapSize);
      const now = Date.now();
      const direction = this.getMapDirection(ship.x, ship.y, mapSize);

      logger.server(serverId, `🚢 货船刷新 @ ${position} ${direction}`);

      eventData.lastEvents.cargoShipSpawn = now;

      const eventPayload = {
        userId: this.userId,
        serverId,
        markerId: ship.id,
        x: ship.x,
        y: ship.y,
        position,
        direction,
        time: now
      };

      this.emit(EventType.CARGO_SPAWN, eventPayload);
      await this.saveEventLog(serverId, EventType.CARGO_SPAWN, eventPayload);

      // 发送游戏内通知
      if (this.isNotificationEnabled('cargo_spawn')) {
        try {
          const msg = notify('cargo_spawn', { position, direction });
          if (msg) {
            await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
          }
        } catch (e) {
          logger.debug(`发送货船刷新通知失败: ${e.message}`);
        }
      }

      // 启动 Egress 计时器
      const egressTimer = EventTimerManager.startTimer(
        `cargo_egress_${ship.id}`,
        serverId,
        EventTiming.CARGO_SHIP_EGRESS_TIME,
        async () => {
          const tracer = eventData.cargoShipTracers.get(ship.id) || [];
          const currentPos = tracer.length > 0 ? tracer[tracer.length - 1] : { x: ship.x, y: ship.y };
          const currentPosition = formatPosition(currentPos.x, currentPos.y, mapSize);

          logger.server(serverId, `🚢 货船Egress @ ${currentPosition}`);

          const payload = {
            userId: this.userId,
            serverId,
            markerId: ship.id,
            position: currentPosition,
            time: Date.now()
          };

          this.emit(EventType.CARGO_EGRESS, payload);
          await this.saveEventLog(serverId, EventType.CARGO_EGRESS, payload);

          if (this.isNotificationEnabled('cargo_egress')) {
            try {
              const msg = notify('cargo_egress', { position: currentPosition });
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送货船Egress通知失败: ${e.message}`);
            }
          }
        }
      );

      // Egress 警告
      egressTimer.addWarning(EventTiming.CARGO_SHIP_EGRESS_WARNING_TIME, async (timeLeft) => {
        const tracer = eventData.cargoShipTracers.get(ship.id) || [];
        const currentPos = tracer.length > 0 ? tracer[tracer.length - 1] : { x: ship.x, y: ship.y };
        const currentPosition = formatPosition(currentPos.x, currentPos.y, mapSize);
        const minutesLeft = Math.floor(timeLeft / 60000);

        logger.server(serverId, `🚢 货船${minutesLeft}分钟后Egress`);

        const payload = {
          userId: this.userId,
          serverId,
          markerId: ship.id,
          position: currentPosition,
          minutesLeft,
          time: Date.now()
        };

        this.emit(EventType.CARGO_EGRESS_WARNING, payload);

        if (this.isNotificationEnabled('cargo_egress')) {
          try {
            const msg = notify('cargo_egress_warning', { position: currentPosition, minutes: minutesLeft });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送货船Egress警告失败: ${e.message}`);
          }
        }
      });

      if (!eventData.cargoShipTracers.has(ship.id)) {
        eventData.cargoShipTracers.set(ship.id, []);
      }
    }

    // 已离开的货船
    const leftShips = previousShips.filter(p =>
      !currentShips.some(c => c.id === p.id)
    );

    for (const ship of leftShips) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(ship.x, ship.y, mapSize);
      const now = Date.now();

      logger.server(serverId, `🚢 货船离开 @ ${position}`);

      eventData.lastEvents.cargoShipLeave = now;

      const payload = {
        userId: this.userId,
        serverId,
        markerId: ship.id,
        position,
        time: now
      };

      this.emit(EventType.CARGO_LEAVE, payload);
      await this.saveEventLog(serverId, EventType.CARGO_LEAVE, payload);

      if (this.isNotificationEnabled('cargo_leave')) {
        try {
          const msg = notify('cargo_leave', { position });
          if (msg) {
            await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
          }
        } catch (e) {
          logger.debug(`发送货船离开通知失败: ${e.message}`);
        }
      }

      EventTimerManager.stopTimer(`cargo_egress_${ship.id}`, serverId);
      eventData.cargoShipTracers.delete(ship.id);
      eventData.cargoShipDockedStatus.delete(ship.id);
    }

    // 更新追踪路径
    for (const ship of currentShips) {
      const tracer = eventData.cargoShipTracers.get(ship.id) || [];
      tracer.push({ x: ship.x, y: ship.y, time: Date.now() });

      if (tracer.length > 100) {
        tracer.shift();
      }

      eventData.cargoShipTracers.set(ship.id, tracer);
      await this.checkHarborDocking(serverId, ship);
    }
  }

  /**
   * 检测货船港口停靠
   */
  async checkHarborDocking(serverId, ship) {
    const eventData = this.eventData.get(serverId);
    const monuments = this.monuments.get(serverId) || [];
    const harbors = monuments.filter(m => m.token && m.token.includes('harbor'));
    const hasDockedBefore = eventData.cargoShipDockedStatus.get(ship.id);

    for (const harbor of harbors) {
      const distance = getDistance(ship.x, ship.y, harbor.x, harbor.y);

      if (distance <= EventTiming.HARBOR_CARGO_SHIP_DOCK_DISTANCE) {
        if (!hasDockedBefore) {
          const mapSize = this.rustPlusService.getMapSize(serverId);
          const position = formatPosition(ship.x, ship.y, mapSize);

          logger.server(serverId, `🚢 货船停靠港口`);

          const payload = {
            userId: this.userId,
            serverId,
            markerId: ship.id,
            position,
            harborName: harbor.name || 'Harbor',
            time: Date.now()
          };

          this.emit(EventType.CARGO_DOCK, payload);
          await this.saveEventLog(serverId, EventType.CARGO_DOCK, payload);

          if (this.isNotificationEnabled('cargo_dock')) {
            try {
              const msg = notify('cargo_dock', { position });
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送货船停靠通知失败: ${e.message}`);
            }
          }

          eventData.cargoShipDockedStatus.set(ship.id, true);
        }
        return;
      }
    }

    if (hasDockedBefore) {
      eventData.cargoShipDockedStatus.set(ship.id, false);
    }
  }

  /**
   * 检测武装直升机事件
   */
  async checkPatrolHelicopters(serverId, currentMarkers, previousMarkers) {
    const currentHelis = currentMarkers.filter(m => m.type === AppMarkerType.PatrolHelicopter);
    const previousHelis = previousMarkers.filter(m => m.type === AppMarkerType.PatrolHelicopter);
    const eventData = this.eventData.get(serverId);
    const mapSize = this.rustPlusService.getMapSize(serverId);

    // 新刷新的直升机
    const newHelis = currentHelis.filter(c =>
      !previousHelis.some(p => p.id === c.id)
    );

    for (const heli of newHelis) {
      // 首次轮询时跳过事件触发，避免服务重启时误判已存在的直升机为新刷新
      if (eventData.isFirstPoll) {
        if (!eventData.patrolHeliTracers.has(heli.id)) {
          eventData.patrolHeliTracers.set(heli.id, []);
        }
        continue;
      }

      const position = formatPosition(heli.x, heli.y, mapSize);
      const direction = this.getMapDirection(heli.x, heli.y, mapSize);
      const now = Date.now();

      let predictedPosition = null;
      if (typeof heli.rotation === 'number') {
        const theta = heli.rotation * Math.PI / 180;
        const STEP = 500;
        const px = Math.min(Math.max(heli.x + Math.cos(theta) * STEP, 0), mapSize);
        const py = Math.min(Math.max(heli.y + Math.sin(theta) * STEP, 0), mapSize);
        predictedPosition = formatPosition(px, py, mapSize);
      }

      logger.server(serverId, `🚁 武装直升机刷新 @ ${position} ${direction}`);

      eventData.lastEvents.patrolHeliSpawn = now;

      const payload = {
        userId: this.userId,
        serverId,
        markerId: heli.id,
        x: heli.x,
        y: heli.y,
        position,
        direction,
        predictedPosition,
        time: now
      };

      this.emit(EventType.PATROL_HELI_SPAWN, payload);
      await this.saveEventLog(serverId, EventType.PATROL_HELI_SPAWN, payload);

      if (this.isNotificationEnabled('heli_spawn')) {
        try {
          const message = predictedPosition
            ? notify('heli_spawn_predicted', { position, direction, predicted: predictedPosition })
            : notify('heli_spawn', { position, direction });
          if (message) {
            await this.rustPlusService.sendTeamMessage(serverId, message, { isBot: true });
          }
        } catch (e) {
          logger.debug(`发送直升机刷新通知失败: ${e.message}`);
        }
      }

      if (!eventData.patrolHeliTracers.has(heli.id)) {
        eventData.patrolHeliTracers.set(heli.id, []);
      }
    }

    // 已消失的直升机
    const leftHelis = previousHelis.filter(p =>
      !currentHelis.some(c => c.id === p.id)
    );

    for (const heli of leftHelis) {
      const tracer = eventData.patrolHeliTracers.get(heli.id) || [];
      const lastPos = tracer.length > 0 ? tracer[tracer.length - 1] : { x: heli.x, y: heli.y };
      const position = formatPosition(lastPos.x, lastPos.y, mapSize);
      const direction = this.getMapDirection(lastPos.x, lastPos.y, mapSize);
      const now = Date.now();

      // 判断是击落还是离开（不在地图边缘 = 击落）
      const isNearEdge = this.isNearMapEdge(lastPos.x, lastPos.y, mapSize);

      if (!isNearEdge) {
        // 击落
        logger.server(serverId, `🚁 武装直升机被击落 @ ${position} ${direction}`);

        eventData.lastEvents.patrolHeliDowned = now;

        const payload = {
          userId: this.userId,
          serverId,
          markerId: heli.id,
          x: lastPos.x,
          y: lastPos.y,
          position,
          direction,
          time: now
        };

        this.emit(EventType.PATROL_HELI_DOWNED, payload);
        await this.saveEventLog(serverId, EventType.PATROL_HELI_DOWNED, payload);

        if (this.isNotificationEnabled('heli_downed')) {
          try {
            const msg = notify('heli_downed', { position, direction });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送直升机击落通知失败: ${e.message}`);
          }
        }

        // 启动箱子解锁计时器（约15分钟）
        EventTimerManager.stopTimer(`heli_crate_${heli.id}`, serverId);

        const crateTimer = EventTimerManager.startTimer(
          `heli_crate_${heli.id}`,
          serverId,
          EventTiming.HELI_CRATE_UNLOCK_TIME || 15 * 60 * 1000,
          async () => {
            logger.server(serverId, `🚁 直升机残骸箱子已解锁 @ ${position}`);

            this.emit('patrol_heli:crate_unlocked', {
              userId: this.userId,
              serverId,
              position,
              time: Date.now()
            });

            if (this.isNotificationEnabled('heli_downed')) {
              try {
                const msg = `直升机残骸箱子已解锁 @ ${position}`;
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              } catch (e) {
                logger.debug(`发送直升机箱子解锁通知失败: ${e.message}`);
              }
            }
          }
        );

        // 添加警告（解锁前3分钟）
        crateTimer.addWarning(3 * 60 * 1000, async (timeLeft) => {
          const minutesLeft = Math.floor(timeLeft / 60000);

          logger.server(serverId, `🚁 直升机残骸箱子 ${minutesLeft} 分钟后解锁`);

          if (this.isNotificationEnabled('heli_downed')) {
            try {
              const msg = `直升机残骸箱子 ${minutesLeft} 分钟后解锁 @ ${position}`;
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            } catch (e) {
              logger.debug(`发送直升机箱子警告通知失败: ${e.message}`);
            }
          }
        });

      } else {
        // 离开
        logger.server(serverId, `🚁 武装直升机离开 ${direction}`);

        eventData.lastEvents.patrolHeliLeave = now;

        const payload = {
          userId: this.userId,
          serverId,
          markerId: heli.id,
          direction,
          time: now
        };

        this.emit(EventType.PATROL_HELI_LEAVE, payload);

        if (this.isNotificationEnabled('heli_leave')) {
          try {
            const msg = notify('heli_leave', { direction });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送直升机离开通知失败: ${e.message}`);
          }
        }
      }

      // 清理追踪数据
      eventData.patrolHeliTracers.delete(heli.id);
    }

    // 更新追踪路径
    for (const heli of currentHelis) {
      const tracer = eventData.patrolHeliTracers.get(heli.id) || [];
      tracer.push({ x: heli.x, y: heli.y, time: Date.now() });

      if (tracer.length > 100) {
        tracer.shift();
      }

      eventData.patrolHeliTracers.set(heli.id, tracer);
    }
  }

  /**
   * 检测 CH47 事件
   * CH47 出现在油井附近时触发油井事件
   */
  async checkCH47s(serverId, currentMarkers, previousMarkers) {
    const currentCH47s = currentMarkers.filter(m => m.type === AppMarkerType.CH47);
    const previousCH47s = previousMarkers.filter(m => m.type === AppMarkerType.CH47);
    const eventData = this.eventData.get(serverId);
    const monuments = this.monuments.get(serverId) || [];
    const mapSize = this.rustPlusService.getMapSize(serverId);

    // 获取油井位置
    const smallOilRigs = monuments.filter(m => m.token === 'oil_rig_small');
    const largeOilRigs = monuments.filter(m => m.token === 'large_oil_rig');

    // 新出现的 CH47
    const newCH47s = currentCH47s.filter(c =>
      !previousCH47s.some(p => p.id === c.id)
    );

    for (const ch47 of newCH47s) {
      const position = formatPosition(ch47.x, ch47.y, mapSize);
      const now = Date.now();

      // 首次轮询跳过事件触发
      if (eventData.isFirstPoll) {
        if (!eventData.ch47Tracers.has(ch47.id)) {
          eventData.ch47Tracers.set(ch47.id, []);
        }
        continue;
      }

      let foundOilRig = false;

      // 检查是否在小油井附近
      for (const oilRig of smallOilRigs) {
        const distance = getDistance(ch47.x, ch47.y, oilRig.x, oilRig.y);
        if (distance <= EventTiming.OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE) {
          foundOilRig = true;
          const oilRigPosition = formatPosition(oilRig.x, oilRig.y, mapSize);
          const direction = this.getMapDirection(oilRig.x, oilRig.y, mapSize);

          logger.server(serverId, `🛢️ 小油井已触发 @ ${oilRigPosition} ${direction}`);

          eventData.lastEvents.smallOilRigTriggered = now;

          const payload = {
            userId: this.userId,
            serverId,
            markerId: ch47.id,
            oilRigType: 'small',
            x: oilRig.x,
            y: oilRig.y,
            position: oilRigPosition,
            direction,
            time: now
          };

          this.emit(EventType.SMALL_OIL_RIG_TRIGGERED, payload);
          await this.saveEventLog(serverId, EventType.SMALL_OIL_RIG_TRIGGERED, payload);

          // 发送触发通知
          if (this.isNotificationEnabled('oil_rig_triggered')) {
            try {
              const msg = notify('small_oil_triggered', { direction });
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送小油井触发通知失败: ${e.message}`);
            }
          }

          // 停止旧计时器（如果存在）
          EventTimerManager.stopTimer('small_oil_crate', serverId);

          // 启动箱子解锁计时器（15分钟）
          const crateTimer = EventTimerManager.startTimer(
            'small_oil_crate',
            serverId,
            EventTiming.OIL_RIG_LOCKED_CRATE_UNLOCK_TIME,
            async () => {
              logger.server(serverId, `🛢️ 小油井箱子已解锁`);

              eventData.lastEvents.smallOilRigCrateUnlocked = Date.now();

              const unlockPayload = {
                userId: this.userId,
                serverId,
                oilRigType: 'small',
                position: oilRigPosition,
                time: Date.now()
              };

              this.emit(EventType.SMALL_OIL_RIG_CRATE_UNLOCKED, unlockPayload);
              await this.saveEventLog(serverId, EventType.SMALL_OIL_RIG_CRATE_UNLOCKED, unlockPayload);

              if (this.isNotificationEnabled('oil_rig_unlocked')) {
                try {
                  const msg = notify('small_oil_unlocked', {});
                  if (msg) {
                    await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                  }
                } catch (e) {
                  logger.debug(`发送小油井解锁通知失败: ${e.message}`);
                }
              }
            }
          );

          // 添加警告（解锁前3分钟）
          crateTimer.addWarning(EventTiming.OIL_RIG_CRATE_WARNING_TIME, async (timeLeft) => {
            const minutesLeft = Math.floor(timeLeft / 60000);

            logger.server(serverId, `🛢️ 小油井箱子 ${minutesLeft} 分钟后解锁`);

            this.emit(EventType.SMALL_OIL_RIG_CRATE_WARNING, {
              userId: this.userId,
              serverId,
              oilRigType: 'small',
              minutesLeft,
              time: Date.now()
            });

            if (this.isNotificationEnabled('oil_rig_warning')) {
              try {
                const msg = notify('small_oil_warning', { minutes: minutesLeft });
                if (msg) {
                  await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                }
              } catch (e) {
                logger.debug(`发送小油井警告通知失败: ${e.message}`);
              }
            }
          });

          // 标记 CH47 类型为油井
          eventData.ch47Types.set(ch47.id, 'oil_rig');

          break;
        }
      }

      // 检查是否在大油井附近
      if (!foundOilRig) {
        for (const oilRig of largeOilRigs) {
          const distance = getDistance(ch47.x, ch47.y, oilRig.x, oilRig.y);
          if (distance <= EventTiming.OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE) {
            foundOilRig = true;
            const oilRigPosition = formatPosition(oilRig.x, oilRig.y, mapSize);
            const direction = this.getMapDirection(oilRig.x, oilRig.y, mapSize);

            logger.server(serverId, `🛢️ 大油井已触发 @ ${oilRigPosition} ${direction}`);

            eventData.lastEvents.largeOilRigTriggered = now;

            const payload = {
              userId: this.userId,
              serverId,
              markerId: ch47.id,
              oilRigType: 'large',
              x: oilRig.x,
              y: oilRig.y,
              position: oilRigPosition,
              direction,
              time: now
            };

            this.emit(EventType.LARGE_OIL_RIG_TRIGGERED, payload);
            await this.saveEventLog(serverId, EventType.LARGE_OIL_RIG_TRIGGERED, payload);

            // 发送触发通知
            if (this.isNotificationEnabled('oil_rig_triggered')) {
              try {
                const msg = notify('large_oil_triggered', { direction });
                if (msg) {
                  await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                }
              } catch (e) {
                logger.debug(`发送大油井触发通知失败: ${e.message}`);
              }
            }

            // 停止旧计时器（如果存在）
            EventTimerManager.stopTimer('large_oil_crate', serverId);

            // 启动箱子解锁计时器（15分钟）
            const crateTimer = EventTimerManager.startTimer(
              'large_oil_crate',
              serverId,
              EventTiming.OIL_RIG_LOCKED_CRATE_UNLOCK_TIME,
              async () => {
                logger.server(serverId, `🛢️ 大油井箱子已解锁`);

                eventData.lastEvents.largeOilRigCrateUnlocked = Date.now();

                const unlockPayload = {
                  userId: this.userId,
                  serverId,
                  oilRigType: 'large',
                  position: oilRigPosition,
                  time: Date.now()
                };

                this.emit(EventType.LARGE_OIL_RIG_CRATE_UNLOCKED, unlockPayload);
                await this.saveEventLog(serverId, EventType.LARGE_OIL_RIG_CRATE_UNLOCKED, unlockPayload);

                if (this.isNotificationEnabled('oil_rig_unlocked')) {
                  try {
                    const msg = notify('large_oil_unlocked', {});
                    if (msg) {
                      await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                    }
                  } catch (e) {
                    logger.debug(`发送大油井解锁通知失败: ${e.message}`);
                  }
                }
              }
            );

            // 添加警告（解锁前3分钟）
            crateTimer.addWarning(EventTiming.OIL_RIG_CRATE_WARNING_TIME, async (timeLeft) => {
              const minutesLeft = Math.floor(timeLeft / 60000);

              logger.server(serverId, `🛢️ 大油井箱子 ${minutesLeft} 分钟后解锁`);

              this.emit(EventType.LARGE_OIL_RIG_CRATE_WARNING, {
                userId: this.userId,
                serverId,
                oilRigType: 'large',
                minutesLeft,
                time: Date.now()
              });

              if (this.isNotificationEnabled('oil_rig_warning')) {
                try {
                  const msg = notify('large_oil_warning', { minutes: minutesLeft });
                  if (msg) {
                    await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                  }
                } catch (e) {
                  logger.debug(`发送大油井警告通知失败: ${e.message}`);
                }
              }
            });

            // 标记 CH47 类型为油井
            eventData.ch47Types.set(ch47.id, 'oil_rig');

            break;
          }
        }
      }

      // 不在油井附近，是普通 CH47 刷新（投放箱子）
      if (!foundOilRig) {
        const direction = this.getMapDirection(ch47.x, ch47.y, mapSize);

        logger.server(serverId, `🚁 CH47 出现 @ ${position} ${direction} (投放上锁箱子)`);

        eventData.lastEvents.ch47Spawn = now;

        // 标记 CH47 类型为投放箱子
        eventData.ch47Types.set(ch47.id, 'crate');

        const payload = {
          userId: this.userId,
          serverId,
          markerId: ch47.id,
          x: ch47.x,
          y: ch47.y,
          position,
          direction,
          time: now
        };

        this.emit(EventType.CH47_SPAWN, payload);
        await this.saveEventLog(serverId, EventType.CH47_SPAWN, payload);

        // 使用 ch47_crate_spawn 模板，明确说明是来投放箱子的
        if (this.isNotificationEnabled('ch47_spawn')) {
          try {
            const msg = notify('ch47_crate_spawn', { position, direction });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送CH47出现通知失败: ${e.message}`);
          }
        }
      }

      // 初始化追踪路径
      if (!eventData.ch47Tracers.has(ch47.id)) {
        eventData.ch47Tracers.set(ch47.id, []);
      }
    }

    // 已离开的 CH47
    const leftCH47s = previousCH47s.filter(p =>
      !currentCH47s.some(c => c.id === p.id)
    );

    for (const ch47 of leftCH47s) {
      const position = formatPosition(ch47.x, ch47.y, mapSize);
      const ch47Type = eventData.ch47Types.get(ch47.id);

      logger.server(serverId, `🚁 CH47 离开 @ ${position}`);

      this.emit(EventType.CH47_LEAVE, {
        userId: this.userId,
        serverId,
        markerId: ch47.id,
        position,
        time: Date.now()
      });

      // 如果是投放箱子类型的 CH47 离开，记录投放信息
      if (ch47Type === 'crate') {
        const tracer = eventData.ch47Tracers.get(ch47.id) || [];
        // 获取 CH47 最后的位置（可能是投放点附近）
        const lastPos = tracer.length > 0 ? tracer[tracer.length - 1] : { x: ch47.x, y: ch47.y };
        const dropPosition = formatPosition(lastPos.x, lastPos.y, mapSize);

        eventData.ch47CrateDropInfo = {
          time: Date.now(),
          x: lastPos.x,
          y: lastPos.y,
          position: dropPosition
        };
        eventData.lastEvents.ch47CrateDrop = Date.now();

        logger.server(serverId, `📦 CH47 可能在 ${dropPosition} 附近投放了上锁箱子`);
      }

      eventData.ch47Tracers.delete(ch47.id);
      eventData.ch47Types.delete(ch47.id);
    }

    // 更新追踪路径
    for (const ch47 of currentCH47s) {
      const tracer = eventData.ch47Tracers.get(ch47.id) || [];
      tracer.push({ x: ch47.x, y: ch47.y, time: Date.now() });

      if (tracer.length > 100) {
        tracer.shift();
      }

      eventData.ch47Tracers.set(ch47.id, tracer);
    }
  }

  /**
   * 检测上锁箱子事件
   */
  async checkLockedCrates(serverId, currentMarkers, previousMarkers) {
    const currentCrates = currentMarkers.filter(m => m.type === AppMarkerType.Crate);
    const previousCrates = previousMarkers.filter(m => m.type === AppMarkerType.Crate);
    const eventData = this.eventData.get(serverId);
    const mapSize = this.rustPlusService.getMapSize(serverId);
    const monuments = this.monuments.get(serverId) || [];

    // 新出现的箱子
    const newCrates = currentCrates.filter(c =>
      !previousCrates.some(p => p.id === c.id)
    );

    for (const crate of newCrates) {
      const position = formatPosition(crate.x, crate.y, mapSize);
      const now = Date.now();

      // 首次轮询跳过
      if (eventData.isFirstPoll) {
        continue;
      }

      // 检测箱子来源
      let crateSource = 'unknown';

      // 1. 优先检查是否有 CH47 投放记录（60秒内，200米内）
      const dropInfo = eventData.ch47CrateDropInfo;
      if (dropInfo) {
        const timeSinceDrop = now - dropInfo.time;
        const distanceToDrop = getDistance(crate.x, crate.y, dropInfo.x, dropInfo.y);

        if (timeSinceDrop <= 60 * 1000 && distanceToDrop <= 200) {
          crateSource = 'ch47';
          // 使用后清除，避免重复匹配
          eventData.ch47CrateDropInfo = null;
        }
      }

      // 2. 如果不是 CH47 投放，检查是否在油井附近（需要该油井最近被触发）
      if (crateSource === 'unknown') {
        const oilRigs = monuments.filter(m =>
          m.token === 'oil_rig_small' || m.token === 'large_oil_rig'
        );

        for (const oilRig of oilRigs) {
          const distance = getDistance(crate.x, crate.y, oilRig.x, oilRig.y);
          if (distance <= EventTiming.OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE) {
            // 检查该油井是否在 20 分钟内被触发过
            const isSmallOil = oilRig.token === 'oil_rig_small';
            const triggerTime = isSmallOil
              ? eventData.lastEvents.smallOilRigTriggered
              : eventData.lastEvents.largeOilRigTriggered;

            if (triggerTime && (now - triggerTime) <= 20 * 60 * 1000) {
              crateSource = isSmallOil ? 'small_oil_rig' : 'large_oil_rig';
              break;
            }
          }
        }
      }

      // 3. 仍然未知，默认为 CH47（可能是轮询错过了投放记录）
      if (crateSource === 'unknown') {
        crateSource = 'ch47';
      }

      eventData.lastEvents.lockedCrateSpawn = now;

      const payload = {
        userId: this.userId,
        serverId,
        markerId: crate.id,
        x: crate.x,
        y: crate.y,
        position,
        source: crateSource,
        time: now
      };

      this.emit(EventType.LOCKED_CRATE_SPAWN, payload);

      // CH47 投放的箱子 - 发送精确落地位置
      if (crateSource === 'ch47') {
        logger.server(serverId, `📦 上锁箱子已落地 @ ${position}`);

        if (this.isNotificationEnabled('crate_spawn')) {
          try {
            const msg = notify('crate_spawn', { position });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送上锁箱子通知失败: ${e.message}`);
          }
        }
      } else {
        logger.server(serverId, `🔒 上锁箱子 @ ${position} (${crateSource})`);
      }
    }

    // 已消失的箱子
    const despawnedCrates = previousCrates.filter(p =>
      !currentCrates.some(c => c.id === p.id)
    );

    for (const crate of despawnedCrates) {
      const position = formatPosition(crate.x, crate.y, mapSize);

      this.emit(EventType.LOCKED_CRATE_DESPAWN, {
        userId: this.userId,
        serverId,
        markerId: crate.id,
        position,
        time: Date.now()
      });
    }
  }

  /**
   * 检测售货机事件
   */
  checkVendingMachines(serverId, currentMarkers, previousMarkers) {
    const currentVendings = currentMarkers.filter(m => m.type === AppMarkerType.VendingMachine);
    const previousVendings = previousMarkers.filter(m => m.type === AppMarkerType.VendingMachine);
    const mapSize = this.rustPlusService.getMapSize(serverId);

    // 新出现的售货机
    const newVendings = currentVendings.filter(c =>
      !previousVendings.some(p => p.id === c.id)
    );

    for (const vending of newVendings) {
      const position = formatPosition(vending.x, vending.y, mapSize);

      logger.server(serverId, `🛒 检测到新售货机: ${vending.name || '未命名'} @ ${position}`);

      this.emit('vending:new', {
        userId: this.userId,
        serverId,
        vendingId: vending.id,
        name: vending.name || '未命名售货机',
        position,
        x: vending.x,
        y: vending.y,
        sellOrders: vending.sellOrders || [],
        time: Date.now()
      });
    }
  }

  /**
   * 检测队伍状态变化
   */
  async checkTeamInfo(serverId) {
    const eventData = this.eventData.get(serverId);
    if (!eventData) return;

    try {
      // 获取服务器配置以获取 ip 和 port
      const serverConfig = this.rustPlusService.serverConfigs.get(serverId);
      let teamInfo;

      if (serverConfig) {
        const { ip, port, playerId } = serverConfig;

        // 尝试从缓存获取（同队伍用户共享）
        teamInfo = globalManager.getCachedTeamInfo(ip, port, playerId);

        if (!teamInfo) {
          // 缓存未命中，发起 API 请求
          teamInfo = await this.rustPlusService.getTeamInfo(serverId);

          // 更新缓存供同队伍用户使用
          if (teamInfo) {
            globalManager.setCachedTeamInfo(ip, port, teamInfo);
          }
        }
      } else {
        // 无配置，直接查询
        teamInfo = await this.rustPlusService.getTeamInfo(serverId);
      }

      if (!teamInfo || !teamInfo.members) return;

      const mapSize = this.rustPlusService.getMapSize(serverId);
      const monuments = this.monuments.get(serverId) || [];
      const now = Date.now();

      // 首次轮询
      if (eventData.isFirstTeamPoll) {
        for (const member of teamInfo.members) {
          const steamId = member.steamId?.toString();
          if (!steamId) continue;

          eventData.teamMembers.set(steamId, {
            name: member.name,
            x: member.x,
            y: member.y,
            isOnline: member.isOnline,
            isAlive: member.isAlive,
            deathTime: member.deathTime,
            spawnTime: member.spawnTime,
            lastMovement: now,
            afkSeconds: 0,
            lastOnlineTime: member.isOnline ? now : null,
            lastOfflineTime: member.isOnline ? null : now
          });
        }
        eventData.isFirstTeamPoll = false;
        return;
      }

      // 检测成员变化（完整实现类似原 EventMonitorService）
      // 这里简化实现，重点是添加 userId 到所有事件

      // 检测玩家状态变化
      for (const member of teamInfo.members) {
        const steamId = member.steamId?.toString();
        if (!steamId) continue;

        const oldState = eventData.teamMembers.get(steamId);

        // 新成员加入队伍 - 动态添加到 teamMembers
        if (!oldState) {
          logger.server(serverId, `👥 新成员加入队伍: ${member.name}`);
          eventData.teamMembers.set(steamId, {
            name: member.name,
            x: member.x,
            y: member.y,
            isOnline: member.isOnline,
            isAlive: member.isAlive,
            deathTime: member.deathTime,
            spawnTime: member.spawnTime,
            lastMovement: now,
            afkSeconds: 0,
            lastOnlineTime: member.isOnline ? now : null,
            lastOfflineTime: member.isOnline ? null : now
          });
          continue;
        }

        const position = formatPosition(member.x, member.y, mapSize, true, false, monuments);

        // 检测上线
        if (oldState.isOnline === false && member.isOnline === true) {
          logger.server(serverId, `🟢 ${member.name} 上线`);

          const payload = {
            userId: this.userId,
            serverId,
            steamId,
            name: member.name,
            time: now
          };

          this.emit(EventType.PLAYER_ONLINE, payload);
          await this.saveEventLog(serverId, EventType.PLAYER_ONLINE, payload);

          if (this.isNotificationEnabled('player_online')) {
            try {
              let msg;
              // 如果有上次下线时间，计算离线时长
              if (oldState.lastOfflineTime) {
                const offlineDuration = now - oldState.lastOfflineTime;
                const duration = formatDuration(offlineDuration);
                msg = notify('player_online_with_duration', { name: member.name, duration });
              } else {
                msg = notify('player_online', { name: member.name });
              }
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送玩家上线通知失败: ${e.message}`);
            }
          }

          // 重置 AFK 状态
          oldState.lastMovement = now;
          oldState.afkSeconds = 0;
          oldState.lastOnlineTime = now;
        }

        // 检测下线
        if (oldState.isOnline === true && member.isOnline === false) {
          logger.server(serverId, `🔴 ${member.name} 下线`);

          const payload = {
            userId: this.userId,
            serverId,
            steamId,
            name: member.name,
            time: now
          };

          this.emit(EventType.PLAYER_OFFLINE, payload);
          await this.saveEventLog(serverId, EventType.PLAYER_OFFLINE, payload);

          if (this.isNotificationEnabled('player_offline')) {
            try {
              let msg;
              // 如果有上线时间，计算本次游玩时长
              if (oldState.lastOnlineTime) {
                const sessionDuration = now - oldState.lastOnlineTime;
                const duration = formatDuration(sessionDuration);
                msg = notify('player_offline_with_duration', { name: member.name, duration });
              } else {
                msg = notify('player_offline', { name: member.name });
              }
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送玩家下线通知失败: ${e.message}`);
            }
          }

          oldState.lastOfflineTime = now;
        }

        // 检测 AFK（玩家在线但位置不变超过设定时间）
        if (member.isOnline) {
          const hasMoved = oldState.x !== member.x || oldState.y !== member.y;
          const afkMinutes = this.notificationSettings?.player_afk_minutes || 3;
          const afkThresholdSeconds = afkMinutes * 60;

          if (hasMoved) {
            // 如果之前是 AFK 状态，发送返回通知
            if (oldState.afkSeconds >= afkThresholdSeconds) {
              logger.server(serverId, `🏃 ${member.name} 已返回`);

              const payload = {
                userId: this.userId,
                serverId,
                steamId,
                name: member.name,
                afkDuration: oldState.afkSeconds,
                time: now
              };

              this.emit(EventType.PLAYER_AFK_RETURNED, payload);

              // AFK 返回不发送游戏内通知，避免刷屏
            }

            oldState.lastMovement = now;
            oldState.afkSeconds = 0;
          } else {
            // 位置没变，累计 AFK 时间
            const timeSinceLastMove = Math.floor((now - oldState.lastMovement) / 1000);
            oldState.afkSeconds = timeSinceLastMove;

            // 刚达到 AFK 阈值时发送通知（在阈值后 10 秒内只触发一次）
            if (timeSinceLastMove >= afkThresholdSeconds && timeSinceLastMove < afkThresholdSeconds + 10) {
              logger.server(serverId, `💤 ${member.name} 已挂机 ${afkMinutes} 分钟`);

              const payload = {
                userId: this.userId,
                serverId,
                steamId,
                name: member.name,
                position,
                afkSeconds: timeSinceLastMove,
                time: now
              };

              this.emit(EventType.PLAYER_AFK, payload);
              await this.saveEventLog(serverId, EventType.PLAYER_AFK, payload);

              if (this.isNotificationEnabled('player_afk')) {
                try {
                  // 默认模板
                  const defaultTemplate = '`{name}` 在 {position} 已挂机 {minutes} 分钟';
                  const template = this.notificationSettings?.player_afk_template?.trim() || defaultTemplate;

                  // 替换变量
                  const msg = template
                    .replace(/{name}/g, member.name)
                    .replace(/{position}/g, position)
                    .replace(/{minutes}/g, afkMinutes);

                  await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                } catch (e) {
                  logger.debug(`发送玩家挂机通知失败: ${e.message}`);
                }
              }
            }
          }
        }

        // 检测死亡
        const isAliveFlipToDead = oldState.isAlive === true && member.isAlive === false;
        const isDeathTimeChanged = oldState.deathTime !== member.deathTime;

        if (isAliveFlipToDead || isDeathTimeChanged) {
          // 使用 oldState 坐标（死亡前最后记录的位置），而不是 member 坐标（可能是复活后的位置）
          const deathPosition = formatPosition(oldState.x, oldState.y, mapSize, true, false, monuments);
          logger.server(serverId, `💀 ${member.name} 死亡 @ ${deathPosition}`);

          const payload = {
            userId: this.userId,
            serverId,
            steamId,
            name: member.name,
            position: deathPosition,
            x: oldState.x,
            y: oldState.y,
            deathTime: member.deathTime,
            time: now
          };

          this.emit(EventType.PLAYER_DIED, payload);
          await this.saveEventLog(serverId, EventType.PLAYER_DIED, payload);

          if (this.isNotificationEnabled('player_death')) {
            try {
              const msg = notify('player_died', { name: member.name, position: deathPosition });
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送玩家死亡通知失败: ${e.message}`);
            }
          }
        }

        // 更新状态
        oldState.name = member.name;
        oldState.x = member.x;
        oldState.y = member.y;
        oldState.isOnline = member.isOnline;
        oldState.isAlive = member.isAlive;
        oldState.deathTime = member.deathTime;
        oldState.spawnTime = member.spawnTime;
      }

      // 同步到扩展队友列表（只添加不删除）
      await this.syncExtendedTeammates(serverId, teamInfo);
    } catch (error) {
      const errorStr = JSON.stringify(error) || String(error);
      if (errorStr.includes('not_found') || errorStr.includes('Timeout') || errorStr.includes('未连接')) {
        return;
      }
      logger.debug(`队伍轮询失败 (用户 ${this.userId}): ${error?.message || errorStr}`);
    }
  }

  /**
   * 同步队友到扩展队友列表（只添加/更新，不删除）
   */
  async syncExtendedTeammates(serverId, teamInfo) {
    if (!teamInfo || !teamInfo.members) return;

    const now = new Date();

    for (const member of teamInfo.members) {
      const steamId = member.steamId?.toString();
      if (!steamId) continue;

      try {
        // Upsert extended_teammates: 存在则更新 lastSeenAt，不存在则创建
        const [existingRows] = await db.query(
          'SELECT id FROM extended_teammates WHERE userId = ? AND serverId = ? AND steamId = ?',
          [this.userId, serverId, steamId]
        );

        if (existingRows[0]) {
          await db.query(
            'UPDATE extended_teammates SET lastSeenAt = ?, updatedAt = NOW() WHERE userId = ? AND serverId = ? AND steamId = ?',
            [now, this.userId, serverId, steamId]
          );
        } else {
          await db.query(
            'INSERT INTO extended_teammates (userId, serverId, steamId, lastSeenAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())',
            [this.userId, serverId, steamId, now]
          );
        }

        // Upsert player_profiles: 同步更新名称
        const [profileRows] = await db.query(
          'SELECT steamId FROM player_profiles WHERE steamId = ?',
          [steamId]
        );

        if (profileRows[0]) {
          await db.query(
            'UPDATE player_profiles SET name = ?, lastUpdated = NOW() WHERE steamId = ?',
            [member.name, steamId]
          );
        } else {
          await db.query(
            'INSERT INTO player_profiles (steamId, name, lastUpdated) VALUES (?, ?, NOW())',
            [steamId, member.name]
          );
        }
      } catch (e) {
        logger.debug(`[扩展队友] 同步失败 ${steamId}: ${e.message}`);
      }
    }
  }

  /**
   * 判断坐标是否在地图边缘
   */
  isNearMapEdge(x, y, mapSize) {
    const threshold = EventTiming.MAP_EDGE_THRESHOLD;
    return (
      x < threshold ||
      y < threshold ||
      x > mapSize - threshold ||
      y > mapSize - threshold
    );
  }

  /**
   * 获取坐标在地图上的方向
   */
  getMapDirection(x, y, mapSize) {
    const centerX = mapSize / 2;
    const centerY = mapSize / 2;
    const dx = x - centerX;
    const dy = y - centerY;

    let ns = '';
    let ew = '';

    if (dy > mapSize * 0.1) {
      ns = '北';
    } else if (dy < -mapSize * 0.1) {
      ns = '南';
    }

    if (dx > mapSize * 0.1) {
      ew = '东';
    } else if (dx < -mapSize * 0.1) {
      ew = '西';
    }

    if (ew && ns) {
      return ew + ns;
    }
    return ew || ns || '中部';
  }

  /**
   * 刷新所有队友的 Steam 数据（头像、封禁等）
   * 包括当前队伍成员和扩展队友列表中的所有玩家
   */
  async refreshPlayerData(serverId) {
    try {
      // 1. 获取当前队伍成员
      const eventData = this.eventData.get(serverId);
      const currentTeamIds = eventData ? Array.from(eventData.teamMembers.keys()) : [];

      // 2. 获取扩展队友列表中的所有玩家
      const [extendedTeammates] = await db.query(
        'SELECT steamId FROM extended_teammates WHERE userId = ? AND serverId = ?',
        [this.userId, serverId]
      );
      const extendedIds = extendedTeammates.map(t => t.steamId);

      // 3. 合并去重
      const allSteamIds = [...new Set([...currentTeamIds, ...extendedIds])];

      if (allSteamIds.length === 0) {
        console.log(`[Steam] 没有需要刷新的玩家 (用户 ${this.userId})`);
        return;
      }

      console.log(`[Steam] 开始刷新 ${allSteamIds.length} 名成员的资料（当前队伍: ${currentTeamIds.length}, 扩展列表: ${extendedIds.length}）`);

      const playersData = await steamService.getBatchPlayerData(allSteamIds);

      let updatedCount = 0;
      let statsCount = 0;

      for (const data of playersData) {
        if (!data.summary) continue;

        // Upsert player_profiles
        const [profileRows] = await db.query(
          'SELECT steamId FROM player_profiles WHERE steamId = ?',
          [data.steamId]
        );

        if (profileRows[0]) {
          await db.query(
            `UPDATE player_profiles SET
              name = ?, avatar = ?, playtime = ?, vacBanned = ?, gameBans = ?, lastUpdated = NOW()
             WHERE steamId = ?`,
            [
              data.summary.personaname,
              data.summary.avatarfull,
              data.playtime?.playtime_forever || 0,
              data.ban?.VACBanned ? 1 : 0,
              data.ban?.NumberOfGameBans || 0,
              data.steamId
            ]
          );
        } else {
          await db.query(
            `INSERT INTO player_profiles (steamId, name, avatar, playtime, vacBanned, gameBans, lastUpdated)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
              data.steamId,
              data.summary.personaname,
              data.summary.avatarfull,
              data.playtime?.playtime_forever || 0,
              data.ban?.VACBanned ? 1 : 0,
              data.ban?.NumberOfGameBans || 0
            ]
          );
        }
        updatedCount++;

        // 如果有统计数据，保存并检查快照
        if (data.stats && !data.stats.private) {
          await this.updatePlayerStats(serverId, data.steamId, data.summary.personaname, data.stats);
          statsCount++;
        }
      }

      console.log(`[Steam] 刷新完成: ${updatedCount} 个资料, ${statsCount} 个统计数据`);
    } catch (error) {
      console.error(`[Steam] 刷新玩家数据失败 (用户 ${this.userId}):`, error?.message || error);
    }
  }

  /**
   * 更新并对比玩家实时统计数据
   * Steam API 字段映射到内部字段名
   */
  async updatePlayerStats(serverId, steamId, playerName, stats) {
    // Steam API 返回的字段名 -> 内部字段名
    const steamToInternalMap = {
      'kill_player': 'players_killed',      // 击杀玩家
      'kill_scientist': 'kill_npc',         // 击杀 NPC (科学家)
      'harvested_wood': 'gather_wood',      // 采集木材
      'harvested_stones': 'gather_stone',   // 采集石头
      'acquired_metal.ore': 'gather_metal', // 获取金属矿
      'acquired_scrap': 'gather_scrap',     // 获取废料
      'deaths': 'deaths',                   // 死亡次数
      'headshot': 'headshots',              // 爆头数
      'bullet_fired': 'bullets_fired',      // 射击次数
      'bullet_hit_player': 'bullets_hit',   // 命中玩家次数
    };

    const thresholds = {
      'players_killed': 1,
      'kill_npc': 3,
      'gather_wood': 1000,
      'gather_stone': 1000,
      'gather_metal': 500,
      'gather_scrap': 100,
      'deaths': 1,
      'headshots': 5,
      'bullets_fired': 50,
      'bullets_hit': 10,
    };

    const statNames = {
      'players_killed': '玩家击杀',
      'kill_npc': 'NPC击杀',
      'gather_wood': '木材',
      'gather_stone': '石料',
      'gather_metal': '金属矿',
      'gather_scrap': '废料',
      'deaths': '死亡',
      'headshots': '爆头',
      'bullets_fired': '射击',
      'bullets_hit': '命中',
    };

    for (const [steamKey, internalKey] of Object.entries(steamToInternalMap)) {
      const value = stats[steamKey] || 0;

      // 计算今日日期范围
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // 查找今日的基准快照（当天第一个快照）
      const [baselineRows] = await db.query(
        `SELECT * FROM player_stats_snapshots
         WHERE steamId = ? AND statKey = ? AND snapshotDate >= ? AND snapshotDate <= ?
         ORDER BY snapshotDate ASC LIMIT 1`,
        [steamId, internalKey, todayStart, todayEnd]
      );
      let baselineSnapshot = baselineRows[0];

      // 获取当前存储的值
      const [oldStatRows] = await db.query(
        'SELECT * FROM player_stats WHERE steamId = ? AND statKey = ?',
        [steamId, internalKey]
      );
      const oldStat = oldStatRows[0];

      // 如果没有基准快照，说明是今天第一次获取数据
      const isFirstFetchToday = !baselineSnapshot;

      if (isFirstFetchToday) {
        // 首次获取：创建基准快照，贡献从此刻开始计算
        await db.query(
          'INSERT INTO player_stats_snapshots (steamId, statKey, statValue, snapshotDate, createdAt) VALUES (?, ?, ?, NOW(), NOW())',
          [steamId, internalKey, value]
        );
        baselineSnapshot = { steamId, statKey: internalKey, statValue: value, snapshotDate: new Date() };
        console.log(`[Steam] ${playerName} 创建 ${internalKey} 今日基准快照: ${value}`);
      } else {
        // 非首次获取：只有数值变化时才创建历史快照
        const [lastSnapshotRows] = await db.query(
          `SELECT * FROM player_stats_snapshots
           WHERE steamId = ? AND statKey = ?
           ORDER BY snapshotDate DESC LIMIT 1`,
          [steamId, internalKey]
        );
        const lastSnapshot = lastSnapshotRows[0];

        // 检查数值是否有变化
        const hasValueChanged = !lastSnapshot || lastSnapshot.statValue !== value;

        // 检查是否距离上次快照至少 5 分钟
        const minInterval = 5 * 60 * 1000; // 5 分钟
        const hasEnoughInterval = !lastSnapshot ||
          (Date.now() - new Date(lastSnapshot.snapshotDate).getTime() >= minInterval);

        // 只有数值变化且间隔足够时才创建快照
        if (hasValueChanged && hasEnoughInterval) {
          await db.query(
            'INSERT INTO player_stats_snapshots (steamId, statKey, statValue, snapshotDate, createdAt) VALUES (?, ?, ?, NOW(), NOW())',
            [steamId, internalKey, value]
          );
          console.log(`[Steam] ${playerName} 创建 ${internalKey} 快照: ${value}`);
        }
      }

      // 更新实时统计 (Upsert)
      if (oldStat) {
        await db.query(
          'UPDATE player_stats SET statValue = ?, updatedAt = NOW() WHERE steamId = ? AND statKey = ?',
          [value, steamId, internalKey]
        );
      } else {
        await db.query(
          'INSERT INTO player_stats (steamId, statKey, statValue, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
          [steamId, internalKey, value]
        );
      }

      // 如果有旧值且增量达到阈值，触发事件（首次获取不触发）
      if (!isFirstFetchToday && oldStat && value > oldStat.statValue) {
        const delta = value - oldStat.statValue;
        if (delta >= (thresholds[internalKey] || 1)) {
          // 计算今日累计贡献 (当前值 - 基准快照值)
          const todayTotal = Math.max(0, value - baselineSnapshot.statValue);

          this.emit('player:contribution', {
            serverId,
            steamId,
            playerName,
            statKey: internalKey,
            statName: statNames[internalKey] || internalKey,
            amount: todayTotal,
            delta
          });
          logger.debug(`[Steam] 玩家 ${playerName} (${steamId}) 贡献更新: ${internalKey} 今日累计: ${todayTotal}`);
        }
      }
    }
  }

  /**
   * 获取事件数据
   */
  getEventData(serverId) {
    return this.eventData.get(serverId);
  }
}

export default UserEventMonitor;
