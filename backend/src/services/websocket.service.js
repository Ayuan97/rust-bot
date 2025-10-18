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

    // 队伍变化
    rustPlusService.on('team:changed', (data) => {
      this.io.emit('team:changed', data);
    });

    // 设备状态变化
    rustPlusService.on('entity:changed', (data) => {
      this.io.emit('entity:changed', data);
      console.log(`🔄 设备 ${data.entityId} 状态变化: ${data.value}`);
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
}

export default new WebSocketService();
