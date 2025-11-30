import RustPlus from '@liamcottle/rustplus.js';
import EventEmitter from 'events';
import CommandsService from './commands.service.js';
import EventMonitorService from './event-monitor.service.js';
import logger from '../utils/logger.js';
import { getCorrectedMapSize } from '../utils/coordinates.js';

class RustPlusService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // serverId -> rustplus instance
    this.cameras = new Map(); // `${serverId}:${cameraId}` -> Camera instance
    this.teamStates = new Map(); // serverId -> 上一次的队伍状态（用于检测变化）
    this.mapCache = new Map(); // serverId -> { width, height, lastUpdate }
    this.eventMonitorService = new EventMonitorService(this); // 事件监控服务
    this.commandsService = new CommandsService(this, this.eventMonitorService); // 命令处理服务
  }

  /**
   * 连接到 Rust+ 服务器
   * @param {Object} config - 服务器配置
   * @param {string} config.serverId - 服务器唯一 ID
   * @param {string} config.ip - 服务器 IP
   * @param {string} config.port - 服务器端口
   * @param {string} config.playerId - 玩家 Steam ID
   * @param {string} config.playerToken - 玩家 Token
   */
  async connect(config) {
    const { serverId, ip, port, playerId, playerToken } = config;

    if (this.connections.has(serverId)) {
      console.log(`服务器 ${serverId} 已连接`);
      return this.connections.get(serverId);
    }

    try {
      const rustplus = new RustPlus(ip, port, playerId, playerToken);

      // 监听连接事件
      rustplus.on('connected', async () => {
        console.log(`✅ 已连接到服务器: ${serverId}`);
        this.emit('server:connected', { serverId });

        // 主动获取初始队伍状态
        try {
          const teamInfo = await this.getTeamInfo(serverId);
          if (teamInfo) {
            this.teamStates.set(serverId, JSON.parse(JSON.stringify(teamInfo)));
            console.log(`📋 已初始化队伍状态 (${teamInfo.members?.length || 0} 名成员)`);
          }
        } catch (err) {
          console.warn(`⚠️  无法获取初始队伍状态: ${err.message}`);
        }

        // 主动获取地图信息以缓存地图大小
        try {
          const mapInfo = await this.getMap(serverId);
          if (mapInfo && mapInfo.width && mapInfo.height) {
            console.log(`🗺️  已获取地图图像尺寸: ${mapInfo.width}x${mapInfo.height}（非世界尺寸）`);
          } else {
            console.warn(`⚠️  地图信息不完整，将使用默认值`);
          }
        } catch (err) {
          console.warn(`⚠️  无法获取地图信息: ${err.message}，将使用默认值 4500`);
        }

        // 启动事件监控
        try {
          this.eventMonitorService.start(serverId);
        } catch (e) {}
      });

      rustplus.on('disconnected', () => {
        console.log(`❌ 服务器断开: ${serverId}`);
        this.connections.delete(serverId);
        this.emit('server:disconnected', { serverId });
        try { this.eventMonitorService.stop(serverId); } catch (e) {}
      });

      rustplus.on('error', (error) => {
        console.error(`❌ 服务器错误 ${serverId}:`, error.message || error);
        this.emit('server:error', { serverId, error: error.message || String(error) });
        
        // 如果是 protobuf 错误，不要让整个应用崩溃
        if (error.message && error.message.includes('missing required')) {
          console.warn('⚠️  检测到 protobuf 格式不兼容，可能是服务器协议版本问题');
          console.warn('💡 建议: 更新 @liamcottle/rustplus.js 到最新版本');
        }
      });

      // 监听消息事件
      rustplus.on('message', (message) => {
        try {
          // 向内部事件总线转发原始消息，便于调试
          this.emit('rust:message', { serverId, raw: message });

          this.handleMessage(serverId, message);
        } catch (err) {
          console.error(`处理消息失败 ${serverId}:`, err.message);
        }
      });

      // 连接到服务器
      await rustplus.connect();
      this.connections.set(serverId, rustplus);

      return rustplus;
    } catch (error) {
      console.error(`连接失败 ${serverId}:`, error.message || error);
      throw error;
    }
  }

  /**
   * 断开服务器连接
   */
  async disconnect(serverId) {
    const rustplus = this.connections.get(serverId);
    if (rustplus) {
      rustplus.disconnect();
      this.connections.delete(serverId);
      console.log(`断开连接: ${serverId}`);
    }

    // 清理该服务器下的相机实例
    for (const key of Array.from(this.cameras.keys())) {
      if (key.startsWith(`${serverId}:`)) {
        const camera = this.cameras.get(key);
        try { await camera?.unsubscribe?.(); } catch (e) {}
        this.cameras.delete(key);
      }
    }

    // 清理队伍状态缓存
    this.teamStates.delete(serverId);
    
    // 清理地图缓存
    this.mapCache.delete(serverId);
  }

  /**
   * 获取服务器信息
   */
  async getServerInfo(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getInfo: {} });
    const info = res.info;
    // 如果包含 mapSize，则用作地图大小缓存的权威来源
    // 存储修正后的地图大小，确保与网格系统对齐
    if (info && info.mapSize) {
      const correctedSize = getCorrectedMapSize(info.mapSize);
      this.mapCache.set(serverId, {
        width: correctedSize,
        height: correctedSize,
        lastUpdate: Date.now()
      });
    }
    return info;
  }

  /**
   * 获取地图信息
   */
  async getMap(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getMap: {} });
    // 注意：AppMap.width/height 是地图图像尺寸（像素），并非世界尺寸。
    // 这里不写入 width/height 到缓存，避免错误覆盖世界尺寸。
    // 如果已经有缓存，则仅更新 lastUpdate。
    if (res.map) {
      const cached = this.mapCache.get(serverId) || {};
      const oceanMargin = typeof res.map.oceanMargin === 'number' ? res.map.oceanMargin : (cached.oceanMargin || 0);
      // 仅更新时间戳与 oceanMargin；不覆盖世界尺寸
      this.mapCache.set(serverId, {
        width: cached.width,
        height: cached.height,
        oceanMargin,
        lastUpdate: Date.now()
      });
    }

    return res.map;
  }

  /**
   * 获取地图大小
   * @param {string} serverId - 服务器ID
   * @returns {number} 地图大小（默认4500）
   */
  getMapSize(serverId) {
    // 优先使用缓存
    const cached = this.mapCache.get(serverId);
    if (cached) {
      // 检查缓存是否过期，防止服务器擦除后使用旧数据
      // 缓存 TTL 调整为 10 分钟，保证坐标换算更及时
      const CACHE_EXPIRE_TIME = 10 * 60 * 1000; // 10分钟
      const now = Date.now();
      
      if (now - cached.lastUpdate > CACHE_EXPIRE_TIME) {
        console.log(`⚠️  地图缓存已过期 (${serverId})，后台刷新`);
        // 缓存过期，但仍返回缓存值（不阻塞当前操作）
        // 后台异步刷新
        this.refreshMapCacheInBackground(serverId);
      }
      
      // 使用地图的宽度作为地图大小（Rust地图通常是正方形）
      return cached.width || 4500;
    }
    
    // 如果没有缓存，尝试异步获取（不阻塞）
    if (this.connections.has(serverId)) {
      this.refreshMapCacheInBackground(serverId);
    }
    
    // 返回默认值（标准地图大小）
    return 4500;
  }

  /**
   * 获取海洋边距（oceanMargin）
   */
  getMapOceanMargin(serverId) {
    return this.mapCache.get(serverId)?.oceanMargin || 0;
  }

  /**
   * 获取可靠的地图大小（必要时同步刷新缓存）
   * 用于需要准确坐标换算的场景（如通知/消息格式化）
   * @param {string} serverId
   * @returns {Promise<number>}
   */
  async getReliableMapSize(serverId) {
    const cached = this.mapCache.get(serverId);
    const TTL = 10 * 60 * 1000; // 10分钟
    const now = Date.now();
    const needRefresh = !cached || (now - cached.lastUpdate > TTL);

    if (needRefresh) {
      try {
        // 优先使用 AppInfo.mapSize
        const info = await this.getServerInfo(serverId);
        if (info && info.mapSize) return info.mapSize;
        // 不再使用 AppMap.width 作为世界尺寸来源，避免像素尺寸污染
        // 仅在没有可靠信息时继续使用已有缓存（若存在），否则返回默认 4500
      } catch (e) {
        console.warn(`⚠️ 同步刷新地图失败 (${serverId}):`, e?.message || e);
      }
    }
    const width = this.mapCache.get(serverId)?.width;
    // 简单有效性校验：像素图常见宽度（如 2048、3072、3125）小于 3500，则视为不可靠
    if (!width || width < 3500) {
      return 4500;
    }
    return width;
  }

  /**
   * 直接实时获取世界尺寸与海洋边距（不使用缓存）
   * @returns {Promise<{mapSize:number,oceanMargin:number}>}
   */
  async getLiveMapContext(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    // 直接请求 AppInfo 获取世界尺寸
    let mapSize = 4500;
    try {
      const infoRes = await rustplus.sendRequestAsync({ getInfo: {} });
      if (infoRes?.info?.mapSize) {
        // 使用修正后的地图大小，确保与网格系统对齐
        mapSize = getCorrectedMapSize(infoRes.info.mapSize);
      }
    } catch (e) {
      // 忽略错误，使用默认值
    }

    // 直接请求 AppMap 获取 oceanMargin
    let oceanMargin = 0;
    try {
      const mapRes = await rustplus.sendRequestAsync({ getMap: {} });
      if (typeof mapRes?.map?.oceanMargin === 'number') {
        oceanMargin = mapRes.map.oceanMargin;
      }
    } catch (e) {
      // 忽略错误，使用默认值
    }

    return { mapSize, oceanMargin };
  }

  /**
   * 后台异步刷新地图缓存
   * @param {string} serverId - 服务器ID
   */
  async refreshMapCacheInBackground(serverId) {
    // 防止重复刷新
    const refreshKey = `refreshing_${serverId}`;
    if (this[refreshKey]) {
      return;
    }
    
    this[refreshKey] = true;
    
    try {
      // 优先从 getInfo 刷新世界尺寸
      const info = await this.getServerInfo(serverId);
      if (!info?.mapSize) {
        // 退回 getMap 仅为更新时间戳
        await this.getMap(serverId);
      }
      console.log(`✅ 地图缓存已刷新 (${serverId}) -> ${this.mapCache.get(serverId)?.width || 'unknown'}`);
    } catch (error) {
      console.warn(`⚠️  刷新地图缓存失败 (${serverId}):`, error.message);
    } finally {
      delete this[refreshKey];
    }
  }

  /**
   * 获取地图标记
   */
  async getMapMarkers(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getMapMarkers: {} });
    return res.mapMarkers;
  }

  /**
   * 发送队伍聊天消息
   */
  async sendTeamMessage(serverId, message) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    await rustplus.sendRequestAsync({ sendTeamMessage: { message } });
    logger.debug(`📨 发送消息到 ${serverId}: ${message}`);
    return { success: true, message };
  }

  /**
   * 获取队伍信息
   */
  async getTeamInfo(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getTeamInfo: {} });
    return res.teamInfo;
  }

  /**
   * 控制智能设备
   */
  async setEntityValue(serverId, entityId, value) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ entityId, setEntityValue: { value } });
    console.log(`🎛️  设备控制 ${entityId}: ${value}`);
    return res.success || { ok: true };
  }

  /**
   * 打开智能开关
   */
  async turnSmartSwitchOn(serverId, entityId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');
    const res = await rustplus.sendRequestAsync({ entityId, setEntityValue: { value: true } });
    return res.success || { ok: true };
  }

  /**
   * 关闭智能开关
   */
  async turnSmartSwitchOff(serverId, entityId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');
    const res = await rustplus.sendRequestAsync({ entityId, setEntityValue: { value: false } });
    return res.success || { ok: true };
  }

  // ========== 摄像头相关 ==========

  makeCameraKey(serverId, cameraId) {
    return `${serverId}:${cameraId}`;
  }

  async subscribeCamera(serverId, cameraId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const key = this.makeCameraKey(serverId, cameraId);

    // 已存在则直接返回
    if (this.cameras.has(key)) {
      return { serverId, cameraId, subscribed: true };
    }

    const camera = rustplus.getCamera(cameraId);

    // 绑定事件
    camera.on('subscribing', () => this.emit('camera:subscribing', { serverId, cameraId }));
    camera.on('subscribed', () => this.emit('camera:subscribed', { serverId, cameraId }));
    camera.on('unsubscribed', () => this.emit('camera:unsubscribed', { serverId, cameraId }));
    camera.on('render', (buffer) => {
      try {
        const imageBase64 = buffer.toString('base64');
        this.emit('camera:render', {
          serverId,
          cameraId,
          image: `data:image/png;base64,${imageBase64}`
        });
      } catch (e) {
        console.warn('相机帧转码失败:', e?.message || e);
      }
    });

    this.cameras.set(key, camera);
    await camera.subscribe();
    return { serverId, cameraId, subscribed: true };
  }

  async unsubscribeCamera(serverId, cameraId) {
    const key = this.makeCameraKey(serverId, cameraId);
    const camera = this.cameras.get(key);
    if (camera) {
      await camera.unsubscribe();
      this.cameras.delete(key);
    }
    return { serverId, cameraId, subscribed: false };
  }

  getCameraOrThrow(serverId, cameraId) {
    const key = this.makeCameraKey(serverId, cameraId);
    const camera = this.cameras.get(key);
    if (!camera) throw new Error('相机未订阅');
    return camera;
  }

  async cameraMove(serverId, cameraId, buttons, x, y) {
    const camera = this.getCameraOrThrow(serverId, cameraId);
    return await camera.move(buttons, x, y);
  }

  async cameraZoom(serverId, cameraId) {
    const camera = this.getCameraOrThrow(serverId, cameraId);
    return await camera.zoom();
  }

  async cameraShoot(serverId, cameraId) {
    const camera = this.getCameraOrThrow(serverId, cameraId);
    return await camera.shoot();
  }

  async cameraReload(serverId, cameraId) {
    const camera = this.getCameraOrThrow(serverId, cameraId);
    return await camera.reload();
  }

  /**
   * 获取设备状态
   */
  async getEntityInfo(serverId, entityId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ entityId, getEntityInfo: {} });
    return res.entityInfo;
  }

  /**
   * 获取时间
   */
  async getTime(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getTime: {} });
    return res.time;
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(serverId, message) {
    const { broadcast } = message;

    if (!broadcast) return;

    // 队伍消息
    if (broadcast.teamMessage) {
      const { message: msg } = broadcast.teamMessage;
      const messageData = {
        serverId,
        message: msg.message,
        name: msg.name,
        steamId: msg.steamId,
        time: msg.time
      };

      // 先尝试作为命令处理（异步，不阻塞）
      (async () => {
        try {
          const isCommand = await this.commandsService.handleMessage(serverId, messageData);
          if (isCommand) {
            // 是命令，同时也发送事件（可选）
            this.emit('team:command', messageData);
          }
        } catch (err) {
          console.error(`处理命令失败:`, err.message);
        }
      })();

      // 无论是否为命令，都发送原始消息事件
      this.emit('team:message', messageData);
    }

    // 队伍变化（包含玩家死亡/复活/上线/下线等状态变化）
    if (broadcast.teamChanged) {
      this.handleTeamChanged(serverId, broadcast.teamChanged);
    }

    // 实体变化（设备状态改变）
    if (broadcast.entityChanged) {
      const { entityId, payload } = broadcast.entityChanged;
      this.emit('entity:changed', {
        serverId,
        entityId,
        value: payload.value,
        capacity: payload.capacity
      });
    }

    // 氏族变化
    if (broadcast.clanChanged) {
      this.emit('clan:changed', { serverId, data: broadcast.clanChanged });
    }

    // 氏族消息
    if (broadcast.clanMessage) {
      const { message: msg } = broadcast.clanMessage;
      this.emit('clan:message', {
        serverId,
        clanId: broadcast.clanMessage.clanId,
        message: msg.message,
        name: msg.name,
        steamId: msg.steamId,
        time: msg.time
      });
    }

    // 相机射线
    if (broadcast.cameraRays) {
      this.emit('camera:rays', { serverId, data: broadcast.cameraRays });
    }
  }

  /**
   * 处理队伍状态变化，检测并触发玩家状态事件
   */
  handleTeamChanged(serverId, teamChanged) {
    const newTeamInfo = teamChanged.teamInfo;
    const oldTeamState = this.teamStates.get(serverId);

    // 发送原始的队伍变化事件
    this.emit('team:changed', { serverId, data: teamChanged });

    if (!newTeamInfo || !newTeamInfo.members) return;

    // 如果有旧状态，则比较变化
    if (oldTeamState && oldTeamState.members) {
      const oldMembers = new Map(
        oldTeamState.members.map(m => [m.steamId?.toString(), m])
      );

      for (const newMember of newTeamInfo.members) {
        const steamId = newMember.steamId?.toString();
        if (!steamId) continue;

        const oldMember = oldMembers.get(steamId);

        if (oldMember) {
          // 检测死亡事件
          // 1) isAlive 从 true -> false
          // 2) deathTime 出现或递增（某些情况下 isAlive 字段在不同版本/时序可能不稳定）
          const isAliveFlipToDead = oldMember.isAlive === true && newMember.isAlive === false;
          const deathTimeIncreased =
            typeof newMember.deathTime === 'number' &&
            (!oldMember.deathTime || newMember.deathTime > oldMember.deathTime);

          if (isAliveFlipToDead || deathTimeIncreased) {
            logger.debug(`💀 玩家死亡: ${newMember.name} (${steamId})`);
            this.emit('player:died', {
              serverId,
              steamId,
              name: newMember.name,
              deathTime: newMember.deathTime,
              x: newMember.x,
              y: newMember.y
            });
          }

          // 检测复活/重生事件
          if (!oldMember.isAlive && newMember.isAlive) {
            logger.debug(`✨ 玩家复活: ${newMember.name} (${steamId})`);
            this.emit('player:spawned', {
              serverId,
              steamId,
              name: newMember.name,
              spawnTime: newMember.spawnTime,
              x: newMember.x,
              y: newMember.y
            });
          }

          // 检测上线事件
          if (!oldMember.isOnline && newMember.isOnline) {
            logger.debug(`🟢 玩家上线: ${newMember.name} (${steamId})`);
            this.emit('player:online', {
              serverId,
              steamId,
              name: newMember.name,
              isAlive: newMember.isAlive,
              x: newMember.x,
              y: newMember.y
            });
          }

          // 检测下线事件
          if (oldMember.isOnline && !newMember.isOnline) {
            logger.debug(`🔴 玩家下线: ${newMember.name} (${steamId})`);
            this.emit('player:offline', {
              serverId,
              steamId,
              name: newMember.name
            });
          }
        }
      }
    }

    // 保存当前状态供下次比较
    this.teamStates.set(serverId, JSON.parse(JSON.stringify(newTeamInfo)));
  }

  /**
   * 获取所有连接的服务器
   */
  getConnectedServers() {
    return Array.from(this.connections.keys());
  }

  /**
   * 检查服务器是否已连接
   */
  isConnected(serverId) {
    return this.connections.has(serverId);
  }

  /**
   * 获取命令服务实例（用于注册自定义命令）
   */
  getCommandsService() {
    return this.commandsService;
  }
}

export default new RustPlusService();
