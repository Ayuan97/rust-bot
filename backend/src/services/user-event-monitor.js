/**
 * UserEventMonitor - 用户级别的事件监控服务
 * 监听特定用户服务器的游戏事件
 */

import EventEmitter from 'events';
import db from '../lib/db.js';
import { AppMarkerType, EventTiming, EventType, MonumentTokens } from '../utils/event-constants.js';
import { formatPosition, getDistance, getDirection } from '../utils/coordinates.js';
import MONUMENT_INFO from '../utils/monument-info.js';
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
const AFK_MOVEMENT_THRESHOLD_METERS = 3; // 玩家位移超过该值才判定为“有移动”，避免坐标抖动导致计时重置

// 直升机可访问纪念碑 token 列表
const HELI_ACCESSIBLE_MONUMENTS = [
  'launchsite',           // 发射场
  'airfield_display_name', // 机场
  'power_plant_display_name', // 电厂
  'military_tunnels_display_name', // 军事隧道
  'train_yard_display_name', // 火车站
  'water_treatment_plant_display_name', // 污水处理厂
  'excavator',            // 巨型挖掘机
  'dome_monument_name',   // 大铁球
  'satellite_dish_display_name', // 雷达残骸
  'junkyard_display_name', // 垃圾场
  'sewer_display_name',   // 下水道
  'harbor_display_name',  // 港口
  'harbor_2_display_name' // 港口2
];

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  player_death: true,
  player_online: true,
  player_offline: true,
  player_joined_team: true,
  player_left_team: true,
  player_afk: true,
  player_afk_minutes: 3,        // AFK 触发时间（分钟），默认 3 分钟
  player_afk_template: '',      // AFK 消息模板（空则使用默认）
  player_afk_return: true,      // AFK 返回通知启用
  player_afk_return_template: '', // AFK 返回消息模板
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
  bradley_destroyed: true,          // 坦克被摧毁提醒
  bradley_crate: true,              // 坦克箱子可拾取提醒
  bradley_respawn: true,            // 坦克重生提醒
  crate_spawn: false,
  ch47_spawn: false,
  vending_new: false,
  travelling_vendor_spawn: true,          // 流浪商人出现提醒
  travelling_vendor_leave_warning: true,  // 流浪商人离开前提醒
  travelling_vendor_leave: false,         // 流浪商人已离开提醒（默认关，与 cargo_leave/heli_leave 一致）
  day_night_enabled: true,
  day_notify_minutes: 5,
  night_notify_minutes: 8,
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
    this.lastMonumentsRetry = new Map(); // serverId -> timestamp (节流重试)
    this.isPolling = new Map(); // serverId -> boolean
    this.lastActivitySample = new Map(); // serverId -> timestamp（活动热力采样节流，每分钟一次）

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
        // 创建默认设置（带主键 id；两个子服务可能并发插入，用 ON DUPLICATE 保证幂等）
        await db.query(
          `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
           VALUES (?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE updatedAt = updatedAt`,
          [uuidv4(), this.userId, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)]
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
      'travelling_vendor:spawn': 'TRAVELLING_VENDOR_SPAWN',
      'travelling_vendor:leave': 'TRAVELLING_VENDOR_LEAVE',
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
    // DEBUG: 记录 start 调用
    logger.debug(`[START-DEBUG] start() called for serverId=${serverId}, has=${this.pollIntervals.has(serverId)}`);

    if (this.pollIntervals.has(serverId)) {
      logger.debug(`[START-DEBUG] Skipping - already running for serverId=${serverId}`);
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
      knownExplosions: new Map(),     // 已知爆炸标记: id -> { x, y, time }
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
        lockedCrateSpawn: null,
        bradleyDestroyed: null,       // 坦克被摧毁时间
        travellingVendorSpawn: null   // 流浪商人出现时间
      },
      knownTravellingVendors: new Map(),  // 已追踪的流浪商人 marker
      knownVendingMachines: new Map(),
      isFirstPoll: true,
      teamMembers: new Map(),
      isFirstTeamPoll: true,
      teamLeaderSteamId: null
    });

    // 获取古迹位置
    await this.loadMonuments(serverId);

    // 启动轮询
    const interval = setInterval(async () => {
      // 防止重入：如果上一次轮询还在进行中，则跳过本次
      if (this.isPolling.get(serverId)) {
        return;
      }

      this.isPolling.set(serverId, true);
      try {
        await this.checkMapMarkers(serverId);
      } catch (error) {
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('not_found') ||
          errorMessage.includes('session closed') ||
          errorMessage.includes('command timeout') ||
          errorMessage.includes('Timeout reached') ||
          errorMessage.includes('服务器未连接')) {
          return;
        }

        console.error(`❌ 事件监控检查失败 ${serverId} (用户 ${this.userId}):`, error);
      } finally {
        this.isPolling.set(serverId, false);
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

    // 初始刷新：延迟 90 秒等队伍信息首次加载（否则刚启动时队伍还空，初始刷新会"没有需要刷新的玩家"，
    // 导致每次重启后头像/资料要干等到下一个 10 分钟周期）。回调里校验该服务器仍在监控中，避免在已停止状态上执行。
    console.log(`[Steam] 🚀 将在 90 秒后执行初始刷新（等队伍数据就绪）...`);
    setTimeout(() => {
      if (!this.pollIntervals.has(serverId)) return;
      this.refreshPlayerData(serverId).catch(e => {
        console.error(`[Steam] ❌ 初始刷新失败:`, e.message);
      });
    }, 90 * 1000);
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
      this.monuments.delete(serverId);
      this.lastMonumentsRetry.delete(serverId);
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
    // 快照 keys 再遍历：stop() 会同时删除 serverId 与 `${serverId}:players` 两个键，
    // 直接迭代 keys() 会在迭代中改 Map 导致漏清定时器
    for (const serverId of Array.from(this.pollIntervals.keys())) {
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
        logger.server(serverId, `加载古迹: ${map.monuments.length} 个`);
      }
    } catch (error) {
      const errorMsg = error?.message || String(error);

      if (errorMsg.includes('not_found')) {
        // 玩家未在服务器内，静默跳过
        return;
      }

      if (errorMsg.includes('Timeout') && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] || 4000;
        logger.server(serverId, `加载古迹超时，${delay / 1000}秒后重试 (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.loadMonuments(serverId, retryCount + 1);
      }

      // 超过重试次数或其他错误，静默失败（由 checkMapMarkers 的节流机制处理下次重试）
      if (retryCount >= MAX_RETRIES) {
        logger.debug(`服务器 ${serverId} 加载古迹失败（已重试${MAX_RETRIES}次）`);
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

    // DEBUG: 记录轮询时间
    const pollTime = new Date().toISOString();
    const eventData = this.eventData.get(serverId);
    logger.debug(`[POLL-DEBUG] checkMapMarkers called at ${pollTime} (isFirstPoll=${eventData?.isFirstPoll})`);

    // 如果 monuments 为空，尝试重新加载（解决启动时玩家不在服务器导致加载失败的问题）
    // 节流：每 60 秒最多尝试一次
    if (!this.monuments.has(serverId) || this.monuments.get(serverId).length === 0) {
      const lastRetry = this.lastMonumentsRetry.get(serverId) || 0;
      const now = Date.now();
      if (now - lastRetry > 60 * 1000) {
        this.lastMonumentsRetry.set(serverId, now);
        try {
          await this.loadMonuments(serverId);
        } catch (e) {
          // 静默失败，下次轮询再尝试
        }
      }
    }

    // 清理过期的追踪路径
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
    const currentMarkers = Array.isArray(response)
      ? response
      : (response?.markers || []);

    // 获取上次的标记
    const previousMarkers = this.previousMarkers.get(serverId) || [];

    // 检测各类事件
    await this.checkCargoShips(serverId, currentMarkers, previousMarkers);
    await this.checkPatrolHelicopters(serverId, currentMarkers, previousMarkers);
    await this.checkCH47s(serverId, currentMarkers, previousMarkers);
    await this.checkLockedCrates(serverId, currentMarkers, previousMarkers);
    await this.checkVendingMachines(serverId, currentMarkers, previousMarkers);
    await this.checkExplosions(serverId, currentMarkers, previousMarkers);
    await this.checkTravellingVendors(serverId, currentMarkers, previousMarkers);
    await this.checkTeamInfo(serverId);

    // 更新缓存
    const markerCount = currentMarkers.length;
    const heliCount = currentMarkers.filter(m => m.type === AppMarkerType.PatrolHelicopter).length;
    const cargoCount = currentMarkers.filter(m => m.type === AppMarkerType.CargoShip).length;
    logger.debug(`[POLL-DEBUG] Updating previousMarkers: total=${markerCount} helis=${heliCount} cargo=${cargoCount}`);
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

    // DEBUG: 记录当前和上次的货船标记
    if (currentShips.length > 0 || previousShips.length > 0) {
      const currentIds = currentShips.map(s => `${s.id}@(${Math.round(s.x)},${Math.round(s.y)})`).join(',');
      const previousIds = previousShips.map(s => `${s.id}@(${Math.round(s.x)},${Math.round(s.y)})`).join(',');
      logger.debug(`[CARGO-DEBUG] current=[${currentIds}] previous=[${previousIds}]`);
    }

    // 新刷新的货船
    const newShips = currentShips.filter(c =>
      !previousShips.some(p => p.id === c.id)
    );

    // DEBUG: 记录检测到的新货船
    if (newShips.length > 0) {
      const newIds = newShips.map(s => `${s.id}@(${Math.round(s.x)},${Math.round(s.y)})`).join(',');
      logger.debug(`[CARGO-DEBUG] NEW ships detected: [${newIds}] (isFirstPoll=${eventData?.isFirstPoll})`);
    }

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
      const direction = getDirection(ship.x, ship.y, mapSize);

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

    // DEBUG: 记录当前和上次的直升机标记
    if (currentHelis.length > 0 || previousHelis.length > 0) {
      const currentIds = currentHelis.map(h => `${h.id}@(${Math.round(h.x)},${Math.round(h.y)})`).join(',');
      const previousIds = previousHelis.map(h => `${h.id}@(${Math.round(h.x)},${Math.round(h.y)})`).join(',');
      logger.debug(`[HELI-DEBUG] current=[${currentIds}] previous=[${previousIds}]`);
    }

    // 新刷新的直升机
    const newHelis = currentHelis.filter(c =>
      !previousHelis.some(p => p.id === c.id)
    );

    // DEBUG: 记录检测到的新直升机
    if (newHelis.length > 0) {
      const newIds = newHelis.map(h => `${h.id}@(${Math.round(h.x)},${Math.round(h.y)})`).join(',');
      logger.debug(`[HELI-DEBUG] NEW helis detected: [${newIds}] (isFirstPoll=${eventData?.isFirstPoll})`);
    }

    for (const heli of newHelis) {
      // 首次轮询时跳过事件触发，避免服务重启时误判已存在的直升机为新刷新
      if (eventData.isFirstPoll) {
        if (!eventData.patrolHeliTracers.has(heli.id)) {
          eventData.patrolHeliTracers.set(heli.id, []);
        }
        continue;
      }

      const position = formatPosition(heli.x, heli.y, mapSize);
      const direction = getDirection(heli.x, heli.y, mapSize);
      const now = Date.now();

      // 注意：已移除直升机目的地预测
      // 根据 Rust Wiki，直升机会随机访问纪念碑，没有固定路线，预测会误导用户

      logger.server(serverId, `武装直升机刷新 @ ${position} ${direction}`);

      eventData.lastEvents.patrolHeliSpawn = now;

      const payload = {
        userId: this.userId,
        serverId,
        markerId: heli.id,
        x: heli.x,
        y: heli.y,
        position,
        direction,
        time: now
      };

      this.emit(EventType.PATROL_HELI_SPAWN, payload);
      await this.saveEventLog(serverId, EventType.PATROL_HELI_SPAWN, payload);

      if (this.isNotificationEnabled('heli_spawn')) {
        try {
          const message = notify('heli_spawn', { position, direction });
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
      const now = Date.now();

      // 判断是击落还是离开（不在地图边缘 = 击落）
      const isNearEdge = this.isNearMapEdge(lastPos.x, lastPos.y, mapSize);

      if (!isNearEdge) {
        // 击落 - 尝试从爆炸标记获取更精确的坠毁位置
        let crashPos = lastPos;

        // 检查是否有新的爆炸标记在直升机最后位置附近
        const currentExplosions = currentMarkers.filter(m => m.type === AppMarkerType.Explosion);
        const previousExplosions = previousMarkers.filter(m => m.type === AppMarkerType.Explosion);
        const newExplosions = currentExplosions.filter(c =>
          !previousExplosions.some(p => p.id === c.id)
        );

        // 在直升机最后位置 500 米范围内寻找爆炸标记
        for (const explosion of newExplosions) {
          const distance = getDistance(lastPos.x, lastPos.y, explosion.x, explosion.y);
          if (distance <= 500) {
            // 使用爆炸标记位置作为更精确的坠毁位置
            crashPos = { x: explosion.x, y: explosion.y };
            logger.debug(`直升机坠毁位置已更正: 从追踪位置到爆炸标记 (距离 ${Math.round(distance)}m)`);
            break;
          }
        }

        const position = formatPosition(crashPos.x, crashPos.y, mapSize);
        const direction = getDirection(crashPos.x, crashPos.y, mapSize);

        logger.server(serverId, `武装直升机被击落 @ ${position} ${direction}`);

        eventData.lastEvents.patrolHeliDowned = now;

        const payload = {
          userId: this.userId,
          serverId,
          markerId: heli.id,
          x: crashPos.x,
          y: crashPos.y,
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

        // 启动火焰消散计时器（约3分钟后箱子可拾取）
        // 注意: 直升机残骸箱子没有锁定时间，可以立即打开，但火焰会阻止玩家靠近
        EventTimerManager.stopTimer(`heli_crate_${heli.id}`, serverId);
        EventTimerManager.stopTimer(`heli_debris_${heli.id}`, serverId);

        EventTimerManager.startTimer(
          `heli_crate_${heli.id}`,
          serverId,
          EventTiming.HELI_CRATE_FIRE_DURATION,
          async () => {
            logger.server(serverId, `直升机残骸火焰已消散，箱子可拾取 @ ${position}`);

            this.emit('patrol_heli:crate_available', {
              userId: this.userId,
              serverId,
              position,
              time: Date.now()
            });

            if (this.isNotificationEnabled('heli_downed')) {
              try {
                const msg = `直升机残骸火焰已消散，箱子可拾取 @ ${position}`;
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              } catch (e) {
                logger.debug(`发送直升机箱子可拾取通知失败: ${e.message}`);
              }
            }
          }
        );

        // 启动机身冷却计时器（约8分钟后可采集金属）
        EventTimerManager.startTimer(
          `heli_debris_${heli.id}`,
          serverId,
          EventTiming.HELI_DEBRIS_COOLING_TIME,
          async () => {
            logger.server(serverId, `直升机残骸已冷却，可采集金属 @ ${position}`);

            this.emit('patrol_heli:debris_cooled', {
              userId: this.userId,
              serverId,
              position,
              time: Date.now()
            });

            if (this.isNotificationEnabled('heli_downed')) {
              try {
                const msg = `直升机残骸已冷却，可采集金属 @ ${position}`;
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              } catch (e) {
                logger.debug(`发送直升机残骸可采集通知失败: ${e.message}`);
              }
            }
          }
        );

      } else {
        // 离开
        const direction = getDirection(lastPos.x, lastPos.y, mapSize);
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
          const direction = getDirection(oilRig.x, oilRig.y, mapSize);

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
            const direction = getDirection(oilRig.x, oilRig.y, mapSize);

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
        const direction = getDirection(ch47.x, ch47.y, mapSize);

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
   * 检测爆炸事件（坦克被摧毁）
   * 通过检测发射场附近的爆炸标记来判断坦克是否被摧毁
   */
  async checkExplosions(serverId, currentMarkers, previousMarkers) {
    const currentExplosions = currentMarkers.filter(m => m.type === AppMarkerType.Explosion);
    const previousExplosions = previousMarkers.filter(m => m.type === AppMarkerType.Explosion);
    const eventData = this.eventData.get(serverId);
    const monuments = this.monuments.get(serverId) || [];
    const mapSize = this.rustPlusService.getMapSize(serverId);

    // 获取发射场位置
    const launchSites = monuments.filter(m => m.token === MonumentTokens.LAUNCH_SITE);

    // 新出现的爆炸标记
    const newExplosions = currentExplosions.filter(c =>
      !previousExplosions.some(p => p.id === c.id)
    );

    for (const explosion of newExplosions) {
      const now = Date.now();

      // 首次轮询跳过
      if (eventData.isFirstPoll) {
        eventData.knownExplosions.set(explosion.id, { x: explosion.x, y: explosion.y, time: now });
        continue;
      }

      // 检查是否在发射场附近（坦克被摧毁）
      for (const launchSite of launchSites) {
        const distance = getDistance(explosion.x, explosion.y, launchSite.x, launchSite.y);

        if (distance <= EventTiming.BRADLEY_DETECTION_RADIUS) {
          // 防止短时间内重复触发（10分钟内只触发一次）
          const lastBradleyDestroyed = eventData.lastEvents.bradleyDestroyed;
          if (lastBradleyDestroyed && (now - lastBradleyDestroyed) < 10 * 60 * 1000) {
            continue;
          }

          const position = formatPosition(explosion.x, explosion.y, mapSize);

          logger.server(serverId, `坦克已被摧毁 @ 发射场`);

          eventData.lastEvents.bradleyDestroyed = now;

          const payload = {
            userId: this.userId,
            serverId,
            markerId: explosion.id,
            x: explosion.x,
            y: explosion.y,
            position,
            time: now
          };

          this.emit(EventType.BRADLEY_DESTROYED, payload);

          // 发送坦克被摧毁通知
          if (this.isNotificationEnabled('bradley_destroyed')) {
            try {
              const msg = notify('bradley_destroyed', {});
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送坦克被摧毁通知失败: ${e.message}`);
            }
          }

          // 停止旧计时器（如果存在）
          EventTimerManager.stopTimer('bradley_crate', serverId);
          EventTimerManager.stopTimer('bradley_respawn_warning', serverId);
          EventTimerManager.stopTimer('bradley_respawn', serverId);

          // 启动箱子火焰消散计时器（5分钟）
          EventTimerManager.startTimer(
            'bradley_crate',
            serverId,
            EventTiming.BRADLEY_CRATE_FIRE_DURATION,
            async () => {
              logger.server(serverId, `坦克箱子火焰已消散，可以拾取`);

              this.emit(EventType.BRADLEY_CRATE_AVAILABLE, {
                userId: this.userId,
                serverId,
                time: Date.now()
              });

              if (this.isNotificationEnabled('bradley_crate')) {
                try {
                  const msg = notify('bradley_crate_available', {});
                  if (msg) {
                    await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                  }
                } catch (e) {
                  logger.debug(`发送坦克箱子可拾取通知失败: ${e.message}`);
                }
              }
            }
          );

          // 启动重生计时器（60分钟）
          const respawnTimer = EventTimerManager.startTimer(
            'bradley_respawn',
            serverId,
            EventTiming.BRADLEY_RESPAWN_TIME,
            () => {
              // 重生时不发送通知，只记录日志
              logger.server(serverId, `坦克已重生`);
            }
          );

          // 添加重生前5分钟警告
          respawnTimer.addWarning(EventTiming.BRADLEY_RESPAWN_WARNING_TIME, async (timeLeft) => {
            const minutesLeft = Math.floor(timeLeft / 60000);

            logger.server(serverId, `坦克将在 ${minutesLeft} 分钟后重生`);

            this.emit(EventType.BRADLEY_RESPAWN_WARNING, {
              userId: this.userId,
              serverId,
              minutesLeft,
              time: Date.now()
            });

            if (this.isNotificationEnabled('bradley_respawn')) {
              try {
                const msg = notify('bradley_respawn_warning', {});
                if (msg) {
                  await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                }
              } catch (e) {
                logger.debug(`发送坦克重生警告失败: ${e.message}`);
              }
            }
          });

          break;
        }
      }

      // 记录已知爆炸标记
      eventData.knownExplosions.set(explosion.id, { x: explosion.x, y: explosion.y, time: now });
    }

    // 清理过期的爆炸标记记录（超过2小时）
    const expiryTime = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, data] of eventData.knownExplosions.entries()) {
      if (data.time < expiryTime) {
        eventData.knownExplosions.delete(id);
      }
    }
  }

  /**
   * 检测流浪商人 (Travelling Vendor) - AppMarkerType=9
   * 行为: 大图(4250+ 含环形公路)随机刷新, 沿环形公路走 30 分钟后离场
   * 注意: 协议不下发 sellOrders, 只能拿位置和方向
   */
  async checkTravellingVendors(serverId, currentMarkers, previousMarkers) {
    const currentVendors = currentMarkers.filter(m => m.type === AppMarkerType.TravellingVendor);
    const previousVendors = previousMarkers.filter(m => m.type === AppMarkerType.TravellingVendor);
    const eventData = this.eventData.get(serverId);
    if (!eventData) return;

    // 新刷新的流浪商人
    const newVendors = currentVendors.filter(c =>
      !previousVendors.some(p => p.id === c.id)
    );

    for (const vendor of newVendors) {
      // 首次轮询跳过, 避免服务重启时把已存在的商人误判为新刷
      if (eventData.isFirstPoll) {
        eventData.knownTravellingVendors.set(vendor.id, { x: vendor.x, y: vendor.y, time: Date.now() });
        continue;
      }

      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(vendor.x, vendor.y, mapSize);
      const direction = getDirection(vendor.x, vendor.y, mapSize);
      const now = Date.now();

      logger.server(serverId, `流浪商人出现 @ ${position} ${direction}`);

      eventData.lastEvents.travellingVendorSpawn = now;
      eventData.knownTravellingVendors.set(vendor.id, { x: vendor.x, y: vendor.y, time: now });

      const eventPayload = {
        userId: this.userId,
        serverId,
        markerId: vendor.id,
        x: vendor.x,
        y: vendor.y,
        position,
        direction,
        time: now
      };

      this.emit(EventType.TRAVELLING_VENDOR_SPAWN, eventPayload);
      await this.saveEventLog(serverId, EventType.TRAVELLING_VENDOR_SPAWN, eventPayload);

      // 发送游戏内通知
      if (this.isNotificationEnabled('travelling_vendor_spawn')) {
        try {
          const msg = notify('travelling_vendor_spawn', { position, direction });
          if (msg) {
            await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
          }
        } catch (e) {
          logger.debug(`发送流浪商人刷新通知失败: ${e.message}`);
        }
      }

      // 启动 30 分钟离场计时器（兜底, 实际离场以 marker 消失为准）
      const leaveTimer = EventTimerManager.startTimer(
        `travelling_vendor_leave_${vendor.id}`,
        serverId,
        EventTiming.TRAVELLING_VENDOR_LIFETIME,
        () => {
          // 兜底逻辑: 30 分钟后还在就不再触发离场, 实际离场由 marker 消失检测
        }
      );

      // 离场前 5 分钟预警
      leaveTimer.addWarning(EventTiming.TRAVELLING_VENDOR_LEAVE_WARNING_TIME, async (timeLeft) => {
        const known = eventData.knownTravellingVendors.get(vendor.id);
        const currentPos = known ? formatPosition(known.x, known.y, mapSize) : position;
        const minutesLeft = Math.floor(timeLeft / 60000);

        const payload = {
          userId: this.userId,
          serverId,
          markerId: vendor.id,
          position: currentPos,
          minutesLeft,
          time: Date.now()
        };

        this.emit(EventType.TRAVELLING_VENDOR_LEAVE_WARNING, payload);

        if (this.isNotificationEnabled('travelling_vendor_leave_warning')) {
          try {
            const msg = notify('travelling_vendor_leave_warning', { minutes: minutesLeft, position: currentPos });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送流浪商人离场预警失败: ${e.message}`);
          }
        }
      });
    }

    // 更新位置追踪 (用于离场预警时显示最后位置)
    for (const vendor of currentVendors) {
      eventData.knownTravellingVendors.set(vendor.id, { x: vendor.x, y: vendor.y, time: Date.now() });
    }

    // 检测离场: previous 有但 current 无
    const leftVendors = previousVendors.filter(p =>
      !currentVendors.some(c => c.id === p.id)
    );

    for (const vendor of leftVendors) {
      if (eventData.isFirstPoll) continue;

      logger.server(serverId, `流浪商人已离开`);

      const payload = {
        userId: this.userId,
        serverId,
        markerId: vendor.id,
        time: Date.now()
      };

      this.emit(EventType.TRAVELLING_VENDOR_LEAVE, payload);
      await this.saveEventLog(serverId, EventType.TRAVELLING_VENDOR_LEAVE, payload);

      if (this.isNotificationEnabled('travelling_vendor_leave')) {
        try {
          const msg = notify('travelling_vendor_leave', {});
          if (msg) {
            await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
          }
        } catch (e) {
          logger.debug(`发送流浪商人离开通知失败: ${e.message}`);
        }
      }

      // 清理状态
      eventData.knownTravellingVendors.delete(vendor.id);
      EventTimerManager.stopTimer(`travelling_vendor_leave_${vendor.id}`, serverId);
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
      const toTeamMemberState = (member) => ({
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

      // 首次轮询
      if (eventData.isFirstTeamPoll) {
        for (const member of teamInfo.members) {
          const steamId = member.steamId?.toString();
          if (!steamId) continue;

          eventData.teamMembers.set(steamId, toTeamMemberState(member));
        }
        eventData.teamLeaderSteamId = teamInfo.leaderSteamId?.toString() || null;
        eventData.isFirstTeamPoll = false;
        return;
      }

      const currentLeaderSteamId = teamInfo.leaderSteamId?.toString() || null;
      const oldLeaderSteamId = eventData.teamLeaderSteamId;
      const currentSteamIdSet = new Set(
        teamInfo.members.map(m => m.steamId?.toString()).filter(Boolean)
      );
      const oldSteamIds = new Set(eventData.teamMembers.keys());

      let leftCount = 0;
      for (const id of oldSteamIds) {
        if (!currentSteamIdSet.has(id)) leftCount++;
      }
      let newCount = 0;
      for (const id of currentSteamIdSet) {
        if (!oldSteamIds.has(id)) newCount++;
      }

      const playerSteamId = serverConfig?.playerId?.toString() || null;
      const onlySelfBefore = oldSteamIds.size === 1 && playerSteamId && oldSteamIds.has(playerSteamId);
      const emptyToTeamBootstrap = oldSteamIds.size === 0 && currentSteamIdSet.size > 0;
      const joinedExistingTeam = onlySelfBefore && currentSteamIdSet.size > 1 && leftCount === 0 && newCount > 0;
      const teamLeaderChanged = oldLeaderSteamId && currentLeaderSteamId && oldLeaderSteamId !== currentLeaderSteamId;
      const shouldSilentResync = emptyToTeamBootstrap || joinedExistingTeam || (teamLeaderChanged && (leftCount > 0 || newCount > 0));

      // 队伍基线发生明显切换时，静默重建快照，避免一次性刷屏“成员加入队伍”
      if (shouldSilentResync) {
        logger.server(
          serverId,
          `检测到队伍基线切换 (leader: ${oldLeaderSteamId || '-'} -> ${currentLeaderSteamId || '-'}, old=${oldSteamIds.size}, new=${currentSteamIdSet.size}, +${newCount}, -${leftCount})，静默重建队伍快照`
        );

        eventData.teamMembers.clear();
        for (const member of teamInfo.members) {
          const steamId = member.steamId?.toString();
          if (!steamId) continue;
          eventData.teamMembers.set(steamId, toTeamMemberState(member));
        }
        eventData.teamLeaderSteamId = currentLeaderSteamId;
        await this.syncExtendedTeammates(serverId, teamInfo);
        return;
      }

      eventData.teamLeaderSteamId = currentLeaderSteamId;

      // 活动热力：每分钟采样一次在线队友位置（避免每轮轮询都写库）
      const sampleActivity = Date.now() - (this.lastActivitySample.get(serverId) || 0) >= 60000;
      if (sampleActivity) this.lastActivitySample.set(serverId, Date.now());

      // 检测玩家状态变化
      for (const member of teamInfo.members) {
        const steamId = member.steamId?.toString();
        if (!steamId) continue;

        // 活动热力采样（每分钟一次，在线队友按 100m 网格累加 count）
        if (sampleActivity && member.isOnline && Number.isFinite(member.x) && Number.isFinite(member.y)) {
          db.query(
            `INSERT INTO map_activity_grid (userId, serverId, steamId, gridX, gridY, count, updatedAt)
             VALUES (?, ?, ?, ?, ?, 1, NOW(3))
             ON DUPLICATE KEY UPDATE count = count + 1, updatedAt = NOW(3)`,
            [this.userId, serverId, steamId, Math.floor(member.x / 100), Math.floor(member.y / 100)]
          ).catch((e) => logger.debug(`活动热力采样失败: ${e.message}`));
        }

        const oldState = eventData.teamMembers.get(steamId);

        // 新成员加入队伍 - 动态添加到 teamMembers
        if (!oldState) {
          logger.server(serverId, `新成员加入队伍: ${member.name}`);
          eventData.teamMembers.set(steamId, toTeamMemberState(member));

          // 触发加入队伍事件
          const payload = {
            userId: this.userId,
            serverId,
            steamId,
            name: member.name,
            time: now
          };
          this.emit(EventType.PLAYER_JOINED_TEAM, payload);

          // 发送加入队伍通知
          if (this.isNotificationEnabled('player_joined_team')) {
            try {
              const msg = notify('player_joined_team', { name: member.name });
              if (msg) {
                await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
              }
            } catch (e) {
              logger.debug(`发送玩家加入队伍通知失败: ${e.message}`);
            }
          }

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
          const movementDistance = getDistance(oldState.x, oldState.y, member.x, member.y);
          const hasMoved = movementDistance >= AFK_MOVEMENT_THRESHOLD_METERS;
          const configuredAfkMinutes = this.notificationSettings?.player_afk_minutes || 3;
          const afkThresholdSeconds = configuredAfkMinutes * 60;

          if (hasMoved) {
            // 如果之前是 AFK 状态，发送返回通知
            if (oldState.afkSeconds >= afkThresholdSeconds) {
              logger.server(serverId, `🏃 ${member.name} 已返回`);
              const afkDurationSeconds = Number.parseInt(oldState.afkSeconds, 10) || 0;
              const afkDurationMinutes = Math.max(1, Math.floor(afkDurationSeconds / 60));
              const afkDurationText = formatDuration(afkDurationSeconds * 1000);

              const payload = {
                userId: this.userId,
                serverId,
                steamId,
                name: member.name,
                afkDuration: afkDurationSeconds,
                time: now
              };

              this.emit(EventType.PLAYER_AFK_RETURNED, payload);

              // 发送 AFK 返回通知
              if (this.isNotificationEnabled('player_afk_return')) {
                try {
                  const defaultTemplate = '`{name}` 在离开 {duration} 后回来了';
                  const template = this.notificationSettings?.player_afk_return_template?.trim() || defaultTemplate;

                  const msg = template
                    .replace(/{name}/g, member.name)
                    .replace(/{minutes}/g, afkDurationMinutes)
                    .replace(/{duration}/g, afkDurationText);

                  await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
                } catch (e) {
                  logger.debug(`发送玩家返回通知失败: ${e.message}`);
                }
              }
            }

            oldState.lastMovement = now;
            oldState.afkSeconds = 0;
          } else {
            // 位置没变，累计 AFK 时间
            const timeSinceLastMove = Math.floor((now - oldState.lastMovement) / 1000);
            // 状态转换检测：之前不是 AFK，现在刚达到阈值
            const wasAfk = oldState.afkSeconds >= afkThresholdSeconds;
            const isGoneAfk = !wasAfk && timeSinceLastMove >= afkThresholdSeconds;
            oldState.afkSeconds = timeSinceLastMove;

            if (isGoneAfk) {
              const afkDurationMinutes = Math.max(1, Math.floor(timeSinceLastMove / 60));
              const afkDurationText = formatDuration(timeSinceLastMove * 1000);
              logger.server(serverId, `💤 ${member.name} 已挂机 ${afkDurationMinutes} 分钟`);

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
                  const defaultTemplate = '`{name}` 在 {position} 已挂机 {duration}';
                  const template = this.notificationSettings?.player_afk_template?.trim() || defaultTemplate;

                  // 替换变量
                  const msg = template
                    .replace(/{name}/g, member.name)
                    .replace(/{position}/g, position)
                    .replace(/{minutes}/g, afkDurationMinutes)
                    .replace(/{duration}/g, afkDurationText);

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
          // 死亡热力：记一个原始死亡点（精确坐标+时间+steamId），供地图热力/精确点展示
          // 仅在坐标有效时记录（与活动采样一致，避免刚入队/无位置时插入 NaN）
          if (Number.isFinite(oldState.x) && Number.isFinite(oldState.y)) {
            try {
              await db.query(
                `INSERT INTO map_death_points (id, userId, serverId, steamId, name, x, y, diedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
                [uuidv4(), this.userId, serverId, steamId, member.name, Math.round(oldState.x), Math.round(oldState.y)]
              );
            } catch (e) {
              logger.debug(`记录死亡热力点失败: ${e.message}`);
            }
          }

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

      // 检测离开队伍的成员
      // 先收集要删除的成员，避免在迭代中修改 Map
      const leftMembers = [];
      for (const [steamId, oldState] of eventData.teamMembers) {
        if (!currentSteamIdSet.has(steamId)) {
          leftMembers.push({ steamId, name: oldState.name });
        }
      }

      // 处理离开的成员
      for (const { steamId, name } of leftMembers) {
        logger.server(serverId, `成员离开队伍: ${name}`);

        // 触发离开队伍事件
        const payload = {
          userId: this.userId,
          serverId,
          steamId,
          name,
          time: now
        };
        this.emit(EventType.PLAYER_LEFT_TEAM, payload);

        // 发送离开队伍通知
        if (this.isNotificationEnabled('player_left_team')) {
          try {
            const msg = notify('player_left_team', { name });
            if (msg) {
              await this.rustPlusService.sendTeamMessage(serverId, msg, { isBot: true });
            }
          } catch (e) {
            logger.debug(`发送玩家离开队伍通知失败: ${e.message}`);
          }
        }

        // 从 teamMembers 中移除
        eventData.teamMembers.delete(steamId);
      }

      // 同步到扩展队友列表（只添加不删除）
      await this.syncExtendedTeammates(serverId, teamInfo);
    } catch (error) {
      const errorStr = error?.message || String(error);
      if (errorStr.includes('not_found') || errorStr.includes('Timeout') || errorStr.includes('未连接')) {
        return;
      }
      logger.debug(`队伍轮询失败 (用户 ${this.userId}): ${errorStr}`);
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

        // Upsert player_profiles: 同步更新名称（ON DUPLICATE 避免多用户并发刷同一 steamId 撞主键）
        await db.query(
          `INSERT INTO player_profiles (steamId, name, lastUpdated) VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE name = VALUES(name), lastUpdated = NOW()`,
          [steamId, member.name]
        );
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

        // Upsert player_profiles（ON DUPLICATE 避免多用户并发刷同一 steamId 撞主键）
        await db.query(
          `INSERT INTO player_profiles (steamId, name, avatar, playtime, vacBanned, gameBans, lastUpdated)
           VALUES (?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name), avatar = VALUES(avatar), playtime = VALUES(playtime),
             vacBanned = VALUES(vacBanned), gameBans = VALUES(gameBans), lastUpdated = NOW()`,
          [
            data.steamId,
            data.summary.personaname,
            data.summary.avatarfull,
            data.playtime?.playtime_forever || 0,
            data.ban?.VACBanned ? 1 : 0,
            data.ban?.NumberOfGameBans || 0
          ]
        );
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
          'INSERT INTO player_stats_snapshots (id, steamId, statKey, statValue, snapshotDate) VALUES (UUID(), ?, ?, ?, NOW())',
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
            'INSERT INTO player_stats_snapshots (id, steamId, statKey, statValue, snapshotDate) VALUES (UUID(), ?, ?, ?, NOW())',
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
          'INSERT INTO player_stats (id, steamId, statKey, statValue, updatedAt) VALUES (UUID(), ?, ?, ?, NOW())',
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
   * 预测直升机目的地纪念碑
   * @param {Object} heli - 直升机对象 (x, y, rotation)
   * @param {Array} monuments - 地图上的纪念碑列表
   * @param {number} mapSize - 地图大小
   * @returns {Object|null} { monument: 纪念碑名称, position: 网格坐标 } 或 null
   */
  predictHeliDestination(heli, monuments, mapSize) {
    if (!monuments || monuments.length === 0) {
      return null;
    }

    // 筛选出可访问的纪念碑
    const accessibleMonuments = monuments.filter(m => {
      return HELI_ACCESSIBLE_MONUMENTS.includes(m.token) && MONUMENT_INFO[m.token];
    });

    if (accessibleMonuments.length === 0) {
      return null;
    }

    // 直升机朝向（弧度）
    const heliRotation = (heli.rotation || 0) * Math.PI / 180;
    const heliDirX = Math.cos(heliRotation);
    const heliDirY = Math.sin(heliRotation);

    let bestMonument = null;
    let bestScore = -Infinity;

    for (const monument of accessibleMonuments) {
      // 计算从直升机到纪念碑的向量
      const dx = monument.x - heli.x;
      const dy = monument.y - heli.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 100) {
        // 距离太近，跳过（可能已经在该纪念碑上空）
        continue;
      }

      // 归一化向量
      const normX = dx / distance;
      const normY = dy / distance;

      // 计算方向一致性（点积）：1 = 完全一致，-1 = 完全相反
      const dotProduct = heliDirX * normX + heliDirY * normY;

      // 只考虑方向大致一致的纪念碑（夹角 < 90度）
      if (dotProduct < 0.3) {
        continue;
      }

      // 评分：方向一致性权重高，距离适中更好
      // 距离得分：太近或太远都不好，理想距离 500-2500 米
      let distanceScore = 1.0;
      if (distance < 500) {
        distanceScore = distance / 500;
      } else if (distance > 2500) {
        distanceScore = 2500 / distance;
      }

      const score = dotProduct * 0.7 + distanceScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestMonument = monument;
      }
    }

    if (bestMonument && MONUMENT_INFO[bestMonument.token]) {
      const monumentName = MONUMENT_INFO[bestMonument.token].name;
      const position = formatPosition(bestMonument.x, bestMonument.y, mapSize);
      return {
        monument: monumentName,
        position: position
      };
    }

    return null;
  }

  /**
   * 获取事件数据
   */
  getEventData(serverId) {
    return this.eventData.get(serverId);
  }
}

export default UserEventMonitor;
