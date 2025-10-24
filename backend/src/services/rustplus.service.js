import RustPlus from '@liamcottle/rustplus.js';
import EventEmitter from 'events';
import CommandsService from './commands.service.js';
import DayNightNotifier from './day-night-notifier.js';

class RustPlusService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // serverId -> rustplus instance
    this.cameras = new Map(); // `${serverId}:${cameraId}` -> Camera instance
    this.teamStates = new Map(); // serverId -> 上一次的队伍状态（用于检测变化）
    this.commandsService = new CommandsService(this); // 命令处理服务
    this.pollingIntervals = new Map(); // serverId -> 轮询定时器
    this.pollingInterval = 5000; // 默认 5 秒轮询一次
    this.messageQueue = new Map(); // serverId -> 消息队列
    this.messageRateLimit = 2000; // 消息发送间隔：2秒（避免被服务器限制）
    this.playerCountHistory = new Map(); // serverId -> [{time, count, queued}] 玩家数量历史
    this.dayNightNotifier = new DayNightNotifier(this); // 昼夜提醒服务

    // 自动重连系统
    this.serverConfigs = new Map(); // serverId -> config (保存连接配置用于重连)
    this.reconnectIntervals = new Map(); // serverId -> 重连定时器
    this.reconnectDelay = 30000; // 重连间隔：30秒
    this.autoReconnect = true; // 是否启用自动重连
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

    // 保存配置用于自动重连
    this.serverConfigs.set(serverId, config);

    if (this.connections.has(serverId)) {
      console.log(`服务器 ${serverId} 已连接`);
      return this.connections.get(serverId);
    }

    // 停止重连定时器（如果存在）
    this.stopReconnect(serverId);

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

            // 输出每个成员的详细状态
            if (teamInfo.members && teamInfo.members.length > 0) {
              console.log('👥 队伍成员列表:');
              teamInfo.members.forEach(m => {
                console.log(`   - ${m.name}: ${m.isOnline ? '🟢在线' : '🔴离线'} ${m.isAlive ? '✅存活' : '💀死亡'}`);
              });
            }
          }
        } catch (err) {
          // AppError { error: 'not_found' } 表示玩家不在队伍中，这是正常的
          const errorStr = JSON.stringify(err) || String(err);
          if (errorStr.includes('not_found')) {
            console.log(`ℹ️  跳过队伍状态初始化（玩家未加入队伍或不在服务器内）`);
          } else {
            console.warn(`⚠️  无法获取初始队伍状态: ${err?.message || errorStr}`);
          }
        }

        // 启动定时轮询队伍状态（用于检测死亡/重生事件）
        this.startTeamStatePolling(serverId);

        // 启动昼夜自动提醒
        this.dayNightNotifier.start(serverId);
      });

      rustplus.on('disconnected', () => {
        console.log(`❌ 服务器断开: ${serverId}`);
        this.connections.delete(serverId);
        this.emit('server:disconnected', { serverId });

        // 启动自动重连
        if (this.autoReconnect) {
          this.startReconnect(serverId);
        }
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
   * @param {string} serverId - 服务器 ID
   * @param {boolean} removeConfig - 是否删除配置（默认 false，手动断开时应设为 true）
   */
  async disconnect(serverId, removeConfig = false) {
    const rustplus = this.connections.get(serverId);
    if (rustplus) {
      rustplus.disconnect();
      this.connections.delete(serverId);
      console.log(`断开连接: ${serverId}`);
    }

    // 停止轮询
    this.stopTeamStatePolling(serverId);

    // 停止昼夜提醒
    this.dayNightNotifier.stop(serverId);

    // 停止自动重连
    this.stopReconnect(serverId);

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

    // 如果需要，删除配置（手动断开时）
    if (removeConfig) {
      this.serverConfigs.delete(serverId);
      console.log(`🗑️  已删除服务器配置: ${serverId.substring(0, 8)}`);
    }
  }

  /**
   * 获取服务器信息
   */
  async getServerInfo(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getInfo: {} });
    return res.info;
  }

  /**
   * 获取地图信息
   */
  async getMap(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getMap: {} });
    return res.map;
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
   * 发送队伍聊天消息（带频率限制）
   */
  async sendTeamMessage(serverId, message) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    // 获取或创建消息队列
    if (!this.messageQueue.has(serverId)) {
      this.messageQueue.set(serverId, {
        queue: [],
        processing: false,
        lastSendTime: 0
      });
    }

    const queueData = this.messageQueue.get(serverId);

    // 添加到队列
    return new Promise((resolve, reject) => {
      queueData.queue.push({ message, resolve, reject });
      this.processMessageQueue(serverId);
    });
  }

  /**
   * 处理消息队列（频率限制）
   */
  async processMessageQueue(serverId) {
    const queueData = this.messageQueue.get(serverId);
    if (!queueData || queueData.processing || queueData.queue.length === 0) {
      return;
    }

    queueData.processing = true;

    while (queueData.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastSend = now - queueData.lastSendTime;

      // 如果距离上次发送不足限制时间，等待
      if (timeSinceLastSend < this.messageRateLimit) {
        const waitTime = this.messageRateLimit - timeSinceLastSend;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const { message, resolve, reject } = queueData.queue.shift();

      try {
        const rustplus = this.connections.get(serverId);
        if (!rustplus) {
          throw new Error('服务器未连接');
        }

        await rustplus.sendRequestAsync({ sendTeamMessage: { message } });
        queueData.lastSendTime = Date.now();
        console.log(`📨 发送消息: ${message}`);
        resolve({ success: true, message });
      } catch (error) {
        console.error(`❌ 发送消息失败: ${error.message}`);
        reject(error);
      }
    }

    queueData.processing = false;
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
   * 获取地图信息（包含古迹位置）
   */
  async getMapInfo(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getMap: {} });
    return res.map;
  }

  /**
   * 获取地图大小
   */
  getMapSize(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus || !rustplus.info) {
      return 4000; // 默认地图大小
    }
    return rustplus.info.mapSize || rustplus.info.size || 4000;
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

    if (!newTeamInfo || !newTeamInfo.members) {
      return;
    }

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
          if (oldMember.isAlive && !newMember.isAlive) {
            console.log('');
            console.log('💀═══════════════════════════════════════');
            console.log(`   玩家死亡: ${newMember.name}`);
            console.log(`   位置: (${Math.round(newMember.x)}, ${Math.round(newMember.y)})`);
            console.log(`   Steam ID: ${steamId}`);
            console.log('═══════════════════════════════════════');

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
            console.log('');
            console.log('✨═══════════════════════════════════════');
            console.log(`   玩家重生: ${newMember.name}`);
            console.log(`   位置: (${Math.round(newMember.x)}, ${Math.round(newMember.y)})`);
            console.log('═══════════════════════════════════════');

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
            console.log(`🟢 玩家上线: ${newMember.name} (${steamId})`);
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
            console.log(`🔴 玩家下线: ${newMember.name} (${steamId})`);
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

  /**
   * 设置事件监控服务（用于事件命令）
   */
  setEventMonitorService(eventMonitorService) {
    this.commandsService.eventMonitorService = eventMonitorService;
    // 如果事件监控服务可用，注册事件命令
    if (eventMonitorService && typeof this.commandsService.registerEventCommands === 'function') {
      this.commandsService.registerEventCommands();
    }
  }

  /**
   * 启动队伍状态轮询（用于检测死亡/重生事件）
   */
  startTeamStatePolling(serverId) {
    // 如果已有轮询，先停止
    this.stopTeamStatePolling(serverId);

    console.log(`🔁 启动队伍状态轮询 (间隔: ${this.pollingInterval}ms)`);

    const intervalId = setInterval(async () => {
      try {
        const teamInfo = await this.getTeamInfo(serverId);
        if (teamInfo) {
          // 模拟 teamChanged 广播
          this.handleTeamChanged(serverId, { teamInfo });
        }
      } catch (error) {
        // AppError { error: 'not_found' } 表示玩家不在队伍中，静默处理
        const errorStr = JSON.stringify(error) || String(error);
        if (errorStr.includes('not_found')) {
          return; // 静默处理
        }

        // 其他错误才输出
        const errorMessage = error?.message || errorStr;
        if (!errorMessage.includes('服务器未连接')) {
          console.warn(`⚠️  轮询队伍状态失败: ${errorMessage}`);
        }
      }
    }, this.pollingInterval);

    this.pollingIntervals.set(serverId, intervalId);
  }

  /**
   * 停止队伍状态轮询
   */
  stopTeamStatePolling(serverId) {
    const intervalId = this.pollingIntervals.get(serverId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(serverId);
      console.log(`⏹️  已停止队伍状态轮询: ${serverId.substring(0, 8)}`);
    }
  }

  /**
   * 设置轮询间隔（毫秒）
   */
  setPollingInterval(interval) {
    this.pollingInterval = interval;
    console.log(`⚙️  轮询间隔已设置为: ${interval}ms`);
  }

  /**
   * 启动自动重连
   */
  startReconnect(serverId) {
    // 如果已有重连定时器，先停止
    this.stopReconnect(serverId);

    const config = this.serverConfigs.get(serverId);
    if (!config) {
      console.warn(`⚠️  无法重连服务器 ${serverId}：配置不存在`);
      return;
    }

    console.log(`🔄 启动自动重连 (${this.reconnectDelay / 1000}秒后尝试)`);

    const intervalId = setInterval(async () => {
      // 检查是否已连接
      if (this.connections.has(serverId)) {
        console.log(`✅ 服务器 ${serverId} 已连接，停止重连`);
        this.stopReconnect(serverId);
        return;
      }

      console.log(`🔄 尝试重连服务器: ${config.ip}:${config.port}`);

      try {
        await this.connect(config);
        console.log(`✅ 重连成功`);
      } catch (error) {
        console.warn(`⚠️  重连失败: ${error.message}`);
        console.log(`   ${this.reconnectDelay / 1000}秒后重试...`);
      }
    }, this.reconnectDelay);

    this.reconnectIntervals.set(serverId, intervalId);
  }

  /**
   * 停止自动重连
   */
  stopReconnect(serverId) {
    const intervalId = this.reconnectIntervals.get(serverId);
    if (intervalId) {
      clearInterval(intervalId);
      this.reconnectIntervals.delete(serverId);
      console.log(`⏹️  已停止自动重连: ${serverId.substring(0, 8)}`);
    }
  }

  /**
   * 设置是否启用自动重连
   */
  setAutoReconnect(enabled) {
    this.autoReconnect = enabled;
    console.log(`⚙️  自动重连已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 设置重连间隔（毫秒）
   */
  setReconnectDelay(delay) {
    this.reconnectDelay = delay;
    console.log(`⚙️  重连间隔已设置为: ${delay}ms`);
  }
}

export default new RustPlusService();
