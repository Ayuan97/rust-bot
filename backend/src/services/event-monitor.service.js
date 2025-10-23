/**
 * 游戏事件监控服务
 * 监听 Rust+ API 的地图标记变化，检测游戏事件
 */

import EventEmitter from 'events';
import { AppMarkerType, EventTiming, EventType } from '../utils/event-constants.js';
import { formatPosition, getDistance } from '../utils/coordinates.js';
import EventTimerManager from '../utils/event-timer.js';

class EventMonitorService extends EventEmitter {
  constructor(rustPlusService) {
    super();
    this.rustPlusService = rustPlusService;
    this.pollIntervals = new Map(); // serverId -> interval
    this.previousMarkers = new Map(); // serverId -> markers array
    this.eventData = new Map(); // serverId -> event-specific data
    this.monuments = new Map(); // serverId -> monuments array
  }

  /**
   * 启动某个服务器的事件监控
   */
  start(serverId) {
    if (this.pollIntervals.has(serverId)) {
      console.log(`🎮 服务器 ${serverId} 的事件监控已在运行`);
      return;
    }

    console.log(`🎮 启动服务器 ${serverId} 的事件监控 (轮询间隔: ${EventTiming.MAP_MARKERS_POLL_INTERVAL / 1000}秒)`);

    // 初始化事件数据
    this.eventData.set(serverId, {
      cargoShipTracers: new Map(),           // markerId -> [{x, y, time}]
      patrolHeliTracers: new Map(),          // markerId -> [{x, y, time}]
      ch47Tracers: new Map(),                // markerId -> [{x, y, time}]

      // 所有事件的上次触发时间
      lastEvents: {
        cargoShipSpawn: null,                // 货船刷新
        cargoShipLeave: null,                // 货船离开
        smallOilRigTriggered: null,          // 小油井触发
        smallOilRigCrateUnlocked: null,      // 小油井箱子解锁
        largeOilRigTriggered: null,          // 大油井触发
        largeOilRigCrateUnlocked: null,      // 大油井箱子解锁
        patrolHeliSpawn: null,               // 武装直升机刷新
        patrolHeliDowned: null,              // 武装直升机被击落
        patrolHeliLeave: null,               // 武装直升机离开
        ch47Spawn: null,                     // CH47刷新
        lockedCrateSpawn: null,              // 上锁箱子出现
        raidDetected: null                   // 袭击检测
      },

      explosions: [],                        // 爆炸记录 [{x, y, time}]
      knownVendingMachines: []               // 已知售货机 [{x, y}]
    });

    // 获取古迹位置（用于油井检测）
    this.loadMonuments(serverId);

    // 启动轮询
    const interval = setInterval(async () => {
      try {
        await this.checkMapMarkers(serverId);
      } catch (error) {
        const errorMessage = error?.message || JSON.stringify(error) || String(error);
        if (!errorMessage.includes('服务器未连接')) {
          console.error(`❌ 事件监控检查失败 ${serverId}:`, error);
        }
      }
    }, EventTiming.MAP_MARKERS_POLL_INTERVAL);

    this.pollIntervals.set(serverId, interval);
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
      console.log(`⏹️  已停止服务器 ${serverId} 的事件监控`);
    }
  }

  /**
   * 加载古迹位置
   */
  async loadMonuments(serverId) {
    try {
      const mapInfo = await this.rustPlusService.getMapInfo(serverId);
      if (mapInfo && mapInfo.monuments) {
        this.monuments.set(serverId, mapInfo.monuments);
        console.log(`🗺️  加载了 ${mapInfo.monuments.length} 个古迹位置`);
      }
    } catch (error) {
      console.error(`❌ 加载古迹位置失败:`, error);
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

    // 获取当前标记
    const response = await this.rustPlusService.getMapMarkers(serverId);
    const currentMarkers = response.markers || [];

    // 获取上次的标记
    const previousMarkers = this.previousMarkers.get(serverId) || [];

    // 检测各类事件
    this.checkCargoShips(serverId, currentMarkers, previousMarkers);
    this.checkPatrolHelicopters(serverId, currentMarkers, previousMarkers);
    this.checkCH47s(serverId, currentMarkers, previousMarkers);
    this.checkLockedCrates(serverId, currentMarkers, previousMarkers);
    this.checkExplosions(serverId, currentMarkers, previousMarkers);

    // 更新缓存
    this.previousMarkers.set(serverId, currentMarkers);
  }

  /**
   * 检测货船事件
   */
  checkCargoShips(serverId, currentMarkers, previousMarkers) {
    const currentShips = currentMarkers.filter(m => m.type === AppMarkerType.CargoShip);
    const previousShips = previousMarkers.filter(m => m.type === AppMarkerType.CargoShip);
    const eventData = this.eventData.get(serverId);

    // 新刷新的货船
    const newShips = currentShips.filter(c =>
      !previousShips.some(p => p.id === c.id)
    );

    for (const ship of newShips) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(ship.x, ship.y, mapSize);
      const now = Date.now();

      console.log(`🚢 [货船刷新] 位置: ${position}`);

      // 记录事件时间
      eventData.lastEvents.cargoShipSpawn = now;

      // 发送刷新事件
      this.emit(EventType.CARGO_SPAWN, {
        serverId,
        markerId: ship.id,
        x: ship.x,
        y: ship.y,
        position,
        time: now
      });

      // 启动 Egress 计时器（50分钟）
      const egressTimer = EventTimerManager.startTimer(
        `cargo_egress_${ship.id}`,
        serverId,
        EventTiming.CARGO_SHIP_EGRESS_TIME,
        () => {
          console.log(`🚢 [货船Egress] 位置: ${position}`);
          this.emit(EventType.CARGO_EGRESS, {
            serverId,
            markerId: ship.id,
            position,
            time: Date.now()
          });
        }
      );

      // 添加Egress前5分钟警告
      egressTimer.addWarning(EventTiming.CARGO_SHIP_EGRESS_WARNING_TIME, (timeLeft) => {
        const minutesLeft = Math.floor(timeLeft / 60000);
        console.log(`🚢 [货船Egress警告] ${minutesLeft}分钟后Egress`);
        this.emit(EventType.CARGO_EGRESS_WARNING, {
          serverId,
          markerId: ship.id,
          position,
          minutesLeft,
          time: Date.now()
        });
      });

      // 初始化追踪路径
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

      console.log(`🚢 [货船离开] 位置: ${position}`);

      // 记录事件时间
      eventData.lastEvents.cargoShipLeave = now;

      this.emit(EventType.CARGO_LEAVE, {
        serverId,
        markerId: ship.id,
        position,
        time: now
      });

      // 停止计时器
      EventTimerManager.stopTimer(`cargo_egress_${ship.id}`, serverId);

      // 清除追踪路径
      eventData.cargoShipTracers.delete(ship.id);
    }

    // 更新追踪路径
    for (const ship of currentShips) {
      const tracer = eventData.cargoShipTracers.get(ship.id) || [];
      tracer.push({ x: ship.x, y: ship.y, time: Date.now() });

      // 只保留最近100个点
      if (tracer.length > 100) {
        tracer.shift();
      }

      eventData.cargoShipTracers.set(ship.id, tracer);

      // 检测港口停靠
      this.checkHarborDocking(serverId, ship);
    }
  }

  /**
   * 检测货船港口停靠
   */
  checkHarborDocking(serverId, ship) {
    const monuments = this.monuments.get(serverId) || [];
    const harbors = monuments.filter(m => m.token && m.token.includes('harbor'));

    for (const harbor of harbors) {
      const distance = getDistance(ship.x, ship.y, harbor.x, harbor.y);

      if (distance <= EventTiming.HARBOR_CARGO_SHIP_DOCK_DISTANCE) {
        const mapSize = this.rustPlusService.getMapSize(serverId);
        const position = formatPosition(ship.x, ship.y, mapSize);

        console.log(`🚢 [货船停靠] 港口: ${harbor.name || 'Harbor'}`);

        this.emit(EventType.CARGO_DOCK, {
          serverId,
          markerId: ship.id,
          position,
          harborName: harbor.name || 'Harbor',
          time: Date.now()
        });
      }
    }
  }

  /**
   * 检测武装直升机事件
   */
  checkPatrolHelicopters(serverId, currentMarkers, previousMarkers) {
    const currentHelis = currentMarkers.filter(m => m.type === AppMarkerType.PatrolHelicopter);
    const previousHelis = previousMarkers.filter(m => m.type === AppMarkerType.PatrolHelicopter);
    const eventData = this.eventData.get(serverId);

    // 新刷新的直升机
    const newHelis = currentHelis.filter(c =>
      !previousHelis.some(p => p.id === c.id)
    );

    for (const heli of newHelis) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(heli.x, heli.y, mapSize);
      const now = Date.now();

      console.log(`🚁 [武装直升机刷新] 位置: ${position}`);

      // 记录事件时间
      eventData.lastEvents.patrolHeliSpawn = now;

      this.emit(EventType.PATROL_HELI_SPAWN, {
        serverId,
        markerId: heli.id,
        x: heli.x,
        y: heli.y,
        position,
        time: now
      });

      // 初始化追踪路径
      if (!eventData.patrolHeliTracers.has(heli.id)) {
        eventData.patrolHeliTracers.set(heli.id, []);
      }
    }

    // 已消失的直升机
    const leftHelis = previousHelis.filter(p =>
      !currentHelis.some(c => c.id === p.id)
    );

    for (const heli of leftHelis) {
      const mapSize = this.rustPlusService.getMapSize(serverId);

      // 获取最后位置
      const tracer = eventData.patrolHeliTracers.get(heli.id) || [];
      const lastPos = tracer.length > 0 ? tracer[tracer.length - 1] : { x: heli.x, y: heli.y };

      const position = formatPosition(lastPos.x, lastPos.y, mapSize);

      // 判断是击落还是离开
      const isNearEdge = this.isNearMapEdge(lastPos.x, lastPos.y, mapSize);

      const now = Date.now();

      if (isNearEdge) {
        console.log(`🚁 [武装直升机离开] 位置: ${position}`);

        // 记录事件时间
        eventData.lastEvents.patrolHeliLeave = now;

        this.emit(EventType.PATROL_HELI_LEAVE, {
          serverId,
          markerId: heli.id,
          position,
          time: now
        });
      } else {
        console.log(`🚁 [武装直升机被击落] 位置: ${position}`);

        // 记录事件时间
        eventData.lastEvents.patrolHeliDowned = now;

        this.emit(EventType.PATROL_HELI_DOWNED, {
          serverId,
          markerId: heli.id,
          x: lastPos.x,
          y: lastPos.y,
          position,
          time: now
        });
      }

      // 清除追踪路径
      eventData.patrolHeliTracers.delete(heli.id);
    }

    // 更新追踪路径
    for (const heli of currentHelis) {
      const tracer = eventData.patrolHeliTracers.get(heli.id) || [];
      tracer.push({ x: heli.x, y: heli.y, time: Date.now() });

      // 只保留最近100个点
      if (tracer.length > 100) {
        tracer.shift();
      }

      eventData.patrolHeliTracers.set(heli.id, tracer);
    }
  }

  /**
   * 检测 CH47 事件（用于油井触发检测）
   */
  checkCH47s(serverId, currentMarkers, previousMarkers) {
    const currentCH47s = currentMarkers.filter(m => m.type === AppMarkerType.CH47);
    const previousCH47s = previousMarkers.filter(m => m.type === AppMarkerType.CH47);
    const eventData = this.eventData.get(serverId);
    const monuments = this.monuments.get(serverId) || [];

    // 新刷新的 CH47
    const newCH47s = currentCH47s.filter(c =>
      !previousCH47s.some(p => p.id === c.id)
    );

    for (const ch47 of newCH47s) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(ch47.x, ch47.y, mapSize);

      // 检测是否在小油井附近
      const smallOilRig = monuments.find(m => m.token === 'oil_rig_small');
      if (smallOilRig) {
        const distance = getDistance(ch47.x, ch47.y, smallOilRig.x, smallOilRig.y);

        if (distance <= EventTiming.OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE) {
          const now = Date.now();
          console.log(`🛢️  [小油井触发] CH47距离: ${Math.floor(distance)}米`);

          // 记录触发时间
          eventData.lastEvents.smallOilRigTriggered = now;

          this.emit(EventType.SMALL_OIL_RIG_TRIGGERED, {
            serverId,
            markerId: ch47.id,
            position,
            time: now
          });

          // 启动箱子解锁计时器（15分钟）
          const crateTimer = EventTimerManager.startTimer(
            `small_oil_rig_crate`,
            serverId,
            EventTiming.OIL_RIG_LOCKED_CRATE_UNLOCK_TIME,
            () => {
              const unlockTime = Date.now();
              console.log(`🛢️  [小油井箱子解锁]`);

              // 记录箱子解锁时间
              const ed = this.eventData.get(serverId);
              if (ed) ed.lastEvents.smallOilRigCrateUnlocked = unlockTime;

              this.emit(EventType.SMALL_OIL_RIG_CRATE_UNLOCKED, {
                serverId,
                time: unlockTime
              });
            }
          );

          // 添加箱子解锁前3分钟警告
          crateTimer.addWarning(EventTiming.OIL_RIG_CRATE_WARNING_TIME, (timeLeft) => {
            const minutesLeft = Math.floor(timeLeft / 60000);
            console.log(`🛢️  [小油井箱子警告] ${minutesLeft}分钟后解锁`);
            this.emit(EventType.SMALL_OIL_RIG_CRATE_WARNING, {
              serverId,
              minutesLeft,
              time: Date.now()
            });
          });
        }
      }

      // 检测是否在大油井附近
      const largeOilRig = monuments.find(m => m.token === 'large_oil_rig');
      if (largeOilRig) {
        const distance = getDistance(ch47.x, ch47.y, largeOilRig.x, largeOilRig.y);

        if (distance <= EventTiming.OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE) {
          const now = Date.now();
          console.log(`🛢️  [大油井触发] CH47距离: ${Math.floor(distance)}米`);

          // 记录触发时间
          eventData.lastEvents.largeOilRigTriggered = now;

          this.emit(EventType.LARGE_OIL_RIG_TRIGGERED, {
            serverId,
            markerId: ch47.id,
            position,
            time: now
          });

          // 启动箱子解锁计时器（15分钟）
          const crateTimer = EventTimerManager.startTimer(
            `large_oil_rig_crate`,
            serverId,
            EventTiming.OIL_RIG_LOCKED_CRATE_UNLOCK_TIME,
            () => {
              const unlockTime = Date.now();
              console.log(`🛢️  [大油井箱子解锁]`);

              // 记录箱子解锁时间
              const ed = this.eventData.get(serverId);
              if (ed) ed.lastEvents.largeOilRigCrateUnlocked = unlockTime;

              this.emit(EventType.LARGE_OIL_RIG_CRATE_UNLOCKED, {
                serverId,
                time: unlockTime
              });
            }
          );

          // 添加箱子解锁前3分钟警告
          crateTimer.addWarning(EventTiming.OIL_RIG_CRATE_WARNING_TIME, (timeLeft) => {
            const minutesLeft = Math.floor(timeLeft / 60000);
            console.log(`🛢️  [大油井箱子警告] ${minutesLeft}分钟后解锁`);
            this.emit(EventType.LARGE_OIL_RIG_CRATE_WARNING, {
              serverId,
              minutesLeft,
              time: Date.now()
            });
          });
        }
      }

      // 通用 CH47 刷新通知
      const ch47Time = Date.now();
      console.log(`🚁 [CH47刷新] 位置: ${position}`);

      // 记录CH47刷新时间
      eventData.lastEvents.ch47Spawn = ch47Time;

      this.emit(EventType.CH47_SPAWN, {
        serverId,
        markerId: ch47.id,
        x: ch47.x,
        y: ch47.y,
        position,
        time: ch47Time
      });
    }

    // 已离开的 CH47
    const leftCH47s = previousCH47s.filter(p =>
      !currentCH47s.some(c => c.id === p.id)
    );

    for (const ch47 of leftCH47s) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(ch47.x, ch47.y, mapSize);

      console.log(`🚁 [CH47离开] 位置: ${position}`);
      this.emit(EventType.CH47_LEAVE, {
        serverId,
        markerId: ch47.id,
        position,
        time: Date.now()
      });
    }
  }

  /**
   * 检测上锁箱子事件
   */
  checkLockedCrates(serverId, currentMarkers, previousMarkers) {
    const currentCrates = currentMarkers.filter(m => m.type === AppMarkerType.Crate);
    const previousCrates = previousMarkers.filter(m => m.type === AppMarkerType.Crate);
    const eventData = this.eventData.get(serverId);

    // 新出现的箱子
    const newCrates = currentCrates.filter(c =>
      !previousCrates.some(p => p.id === c.id)
    );

    for (const crate of newCrates) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(crate.x, crate.y, mapSize);
      const now = Date.now();

      console.log(`🔒 [上锁箱子出现] 位置: ${position}`);

      // 记录上锁箱子出现时间
      eventData.lastEvents.lockedCrateSpawn = now;

      this.emit(EventType.LOCKED_CRATE_SPAWN, {
        serverId,
        markerId: crate.id,
        x: crate.x,
        y: crate.y,
        position,
        time: now
      });
    }

    // 已消失的箱子
    const despawnedCrates = previousCrates.filter(p =>
      !currentCrates.some(c => c.id === p.id)
    );

    for (const crate of despawnedCrates) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(crate.x, crate.y, mapSize);

      console.log(`🔒 [上锁箱子消失] 位置: ${position}`);

      this.emit(EventType.LOCKED_CRATE_DESPAWN, {
        serverId,
        markerId: crate.id,
        position,
        time: Date.now()
      });
    }
  }

  /**
   * 检测爆炸事件
   */
  checkExplosions(serverId, currentMarkers, previousMarkers) {
    const currentExplosions = currentMarkers.filter(m => m.type === AppMarkerType.Explosion);
    const previousExplosions = previousMarkers.filter(m => m.type === AppMarkerType.Explosion);
    const eventData = this.eventData.get(serverId);

    // 新的爆炸
    const newExplosions = currentExplosions.filter(c =>
      !previousExplosions.some(p => p.id === c.id)
    );

    for (const explosion of newExplosions) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(explosion.x, explosion.y, mapSize);

      console.log(`💥 [爆炸检测] 位置: ${position}`);

      // 记录爆炸
      eventData.explosions.push({
        x: explosion.x,
        y: explosion.y,
        position,
        time: Date.now()
      });

      this.emit(EventType.EXPLOSION_DETECTED, {
        serverId,
        markerId: explosion.id,
        x: explosion.x,
        y: explosion.y,
        position,
        time: Date.now()
      });

      // 检测袭击（5分钟内同一区域3次以上爆炸）
      this.checkRaid(serverId, explosion);
    }

    // 清理旧的爆炸记录（保留最近1小时）
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    eventData.explosions = eventData.explosions.filter(e => e.time >= oneHourAgo);
  }

  /**
   * 检测袭击
   */
  checkRaid(serverId, explosion) {
    const eventData = this.eventData.get(serverId);
    const now = Date.now();
    const timeWindow = EventTiming.EXPLOSION_RAID_TIME_WINDOW;

    // 统计5分钟内半径500米内的爆炸次数
    const recentExplosions = eventData.explosions.filter(e => {
      const timeDiff = now - e.time;
      const distance = getDistance(explosion.x, explosion.y, e.x, e.y);
      return timeDiff <= timeWindow && distance <= 500;
    });

    if (recentExplosions.length >= EventTiming.EXPLOSION_RAID_MIN_COUNT) {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(explosion.x, explosion.y, mapSize);
      const now = Date.now();

      console.log(`🔥 [袭击检测] 位置: ${position} (${recentExplosions.length}次爆炸)`);

      // 记录袭击检测时间
      eventData.lastEvents.raidDetected = now;

      this.emit(EventType.RAID_DETECTED, {
        serverId,
        x: explosion.x,
        y: explosion.y,
        position,
        explosionCount: recentExplosions.length,
        time: now
      });
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
   * 获取事件数据（用于命令查询）
   */
  getEventData(serverId) {
    return this.eventData.get(serverId);
  }

  /**
   * 停止所有服务器的监控
   */
  stopAll() {
    for (const serverId of this.pollIntervals.keys()) {
      this.stop(serverId);
    }
  }
}

export default EventMonitorService;
