import { Server } from 'socket.io';
import rustPlusService from './rustplus.service.js';

class WebSocketService {
  constructor() {
    this.io = null;
  }

  /**
   * 初始化 Socket.io
   */
  initialize(server, corsOrigin) {
    this.io = new Server(server, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST']
      }
    });

    this.setupEventHandlers();
    this.setupRustPlusListeners();

    console.log('✅ WebSocket 服务已启动');
  }

  /**
   * 设置客户端事件处理
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 客户端连接: ${socket.id}`);

      // 客户端请求连接到 Rust+ 服务器
      socket.on('server:connect', async (config) => {
        try {
          await rustPlusService.connect(config);
          socket.emit('server:connect:success', { serverId: config.serverId });
        } catch (error) {
          socket.emit('server:connect:error', {
            serverId: config.serverId,
            error: error.message
          });
        }
      });

      // 断开服务器连接
      socket.on('server:disconnect', async (serverId) => {
        try {
          await rustPlusService.disconnect(serverId);
          socket.emit('server:disconnect:success', { serverId });
        } catch (error) {
          socket.emit('server:disconnect:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 发送队伍消息
      socket.on('message:send', async ({ serverId, message }) => {
        try {
          await rustPlusService.sendTeamMessage(serverId, message);
          socket.emit('message:send:success', { serverId, message });
        } catch (error) {
          socket.emit('message:send:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 控制设备
      socket.on('device:control', async ({ serverId, entityId, value }) => {
        try {
          const result = await rustPlusService.setEntityValue(serverId, entityId, value);
          socket.emit('device:control:success', { serverId, entityId, value, result });
        } catch (error) {
          socket.emit('device:control:error', {
            serverId,
            entityId,
            error: error.message
          });
        }
      });

      // 获取设备信息
      socket.on('device:info', async ({ serverId, entityId }) => {
        try {
          const info = await rustPlusService.getEntityInfo(serverId, entityId);
          socket.emit('device:info:success', { serverId, entityId, info });
        } catch (error) {
          socket.emit('device:info:error', {
            serverId,
            entityId,
            error: error.message
          });
        }
      });

      // 获取服务器信息
      socket.on('server:info', async (serverId) => {
        try {
          const info = await rustPlusService.getServerInfo(serverId);
          socket.emit('server:info:success', { serverId, info });
        } catch (error) {
          socket.emit('server:info:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 获取队伍信息
      socket.on('team:info', async (serverId) => {
        try {
          const teamInfo = await rustPlusService.getTeamInfo(serverId);
          socket.emit('team:info:success', { serverId, teamInfo });
        } catch (error) {
          socket.emit('team:info:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 获取地图信息
      socket.on('map:info', async (serverId) => {
        try {
          const mapInfo = await rustPlusService.getMap(serverId);
          socket.emit('map:info:success', { serverId, mapInfo });
        } catch (error) {
          socket.emit('map:info:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 获取地图标记
      socket.on('map:markers', async (serverId) => {
        try {
          const markers = await rustPlusService.getMapMarkers(serverId);
          socket.emit('map:markers:success', { serverId, markers });
        } catch (error) {
          socket.emit('map:markers:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 获取游戏时间
      socket.on('time:get', async (serverId) => {
        try {
          const time = await rustPlusService.getTime(serverId);
          socket.emit('time:get:success', { serverId, time });
        } catch (error) {
          socket.emit('time:get:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 智能开关开/关
      socket.on('switch:on', async ({ serverId, entityId }) => {
        try {
          await rustPlusService.turnSmartSwitchOn(serverId, entityId);
          socket.emit('switch:on:success', { serverId, entityId });
        } catch (error) {
          socket.emit('switch:on:error', { serverId, entityId, error: error.message });
        }
      });

      socket.on('switch:off', async ({ serverId, entityId }) => {
        try {
          await rustPlusService.turnSmartSwitchOff(serverId, entityId);
          socket.emit('switch:off:success', { serverId, entityId });
        } catch (error) {
          socket.emit('switch:off:error', { serverId, entityId, error: error.message });
        }
      });

      // 摄像头订阅/控制
      socket.on('camera:subscribe', async ({ serverId, cameraId }) => {
        try {
          const result = await rustPlusService.subscribeCamera(serverId, cameraId);
          socket.emit('camera:subscribe:success', result);
        } catch (error) {
          socket.emit('camera:subscribe:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:unsubscribe', async ({ serverId, cameraId }) => {
        try {
          const result = await rustPlusService.unsubscribeCamera(serverId, cameraId);
          socket.emit('camera:unsubscribe:success', result);
        } catch (error) {
          socket.emit('camera:unsubscribe:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:move', async ({ serverId, cameraId, buttons, x, y }) => {
        try {
          const result = await rustPlusService.cameraMove(serverId, cameraId, buttons, x, y);
          socket.emit('camera:move:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:move:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:zoom', async ({ serverId, cameraId }) => {
        try {
          const result = await rustPlusService.cameraZoom(serverId, cameraId);
          socket.emit('camera:zoom:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:zoom:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:shoot', async ({ serverId, cameraId }) => {
        try {
          const result = await rustPlusService.cameraShoot(serverId, cameraId);
          socket.emit('camera:shoot:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:shoot:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:reload', async ({ serverId, cameraId }) => {
        try {
          const result = await rustPlusService.cameraReload(serverId, cameraId);
          socket.emit('camera:reload:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:reload:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 客户端断开: ${socket.id}`);
      });
    });
  }

  /**
   * 监听 Rust+ 服务事件并广播给所有客户端
   */
  setupRustPlusListeners() {
    // 服务器连接
    rustPlusService.on('server:connected', (data) => {
      this.io.emit('server:connected', data);
    });

    // 服务器断开
    rustPlusService.on('server:disconnected', (data) => {
      this.io.emit('server:disconnected', data);
    });

    // 服务器错误
    rustPlusService.on('server:error', (data) => {
      this.io.emit('server:error', data);
    });

    // 队伍消息
    rustPlusService.on('team:message', (data) => {
      this.io.emit('team:message', data);
      console.log(`💬 [${data.name}]: ${data.message}`);
    });

    // 队伍命令
    rustPlusService.on('team:command', (data) => {
      this.io.emit('team:command', data);
      console.log(`🎮 [命令 ${data.name}]: ${data.message}`);
    });

    // 队伍变化
    rustPlusService.on('team:changed', (data) => {
      this.io.emit('team:changed', data);
    });

    // 玩家死亡
    rustPlusService.on('player:died', (data) => {
      this.io.emit('player:died', data);
      console.log(`💀 [${data.serverId}] ${data.name} 死亡`);
    });

    // 玩家复活/重生
    rustPlusService.on('player:spawned', (data) => {
      this.io.emit('player:spawned', data);
      console.log(`✨ [${data.serverId}] ${data.name} 重生`);
    });

    // 玩家上线
    rustPlusService.on('player:online', (data) => {
      this.io.emit('player:online', data);
      console.log(`🟢 [${data.serverId}] ${data.name} 上线`);
    });

    // 玩家下线
    rustPlusService.on('player:offline', (data) => {
      this.io.emit('player:offline', data);
      console.log(`🔴 [${data.serverId}] ${data.name} 下线`);
    });

    // 氏族变化
    rustPlusService.on('clan:changed', (data) => {
      this.io.emit('clan:changed', data);
    });

    // 氏族消息
    rustPlusService.on('clan:message', (data) => {
      this.io.emit('clan:message', data);
      console.log(`🏰 [氏族消息 ${data.name}]: ${data.message}`);
    });

    // 设备状态变化
    rustPlusService.on('entity:changed', (data) => {
      this.io.emit('entity:changed', data);
      console.log(`🔄 设备 ${data.entityId} 状态变化: ${data.value}`);
    });

    // 摄像头事件
    rustPlusService.on('camera:subscribing', (data) => this.io.emit('camera:subscribing', data));
    rustPlusService.on('camera:subscribed', (data) => this.io.emit('camera:subscribed', data));
    rustPlusService.on('camera:unsubscribed', (data) => this.io.emit('camera:unsubscribed', data));
    rustPlusService.on('camera:render', (data) => this.io.emit('camera:render', data));

    // 原始消息（调试）
    rustPlusService.on('rust:message', (data) => {
      this.io.emit('rust:message', data);
    });
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * 获取 Socket.IO 实例
   */
  getIO() {
    return this.io;
  }
}

export default new WebSocketService();
