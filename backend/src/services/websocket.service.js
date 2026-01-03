import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import rustPlusService from './rustplus.service.js';
import logger from '../utils/logger.js';

const prisma = new PrismaClient();

class WebSocketService {
  constructor() {
    this.io = null;
    this.rustPlusListenersInitialized = false;
  }

  /**
   * Socket.io 认证中间件
   * 验证 JWT token 并将 userId 附加到 socket
   */
  async authenticateSocket(socket, next) {
    try {
      // 1. 从 auth 或 headers 中获取 token
      let token = socket.handshake.auth?.token;

      if (!token) {
        const authHeader = socket.handshake.headers?.authorization;
        if (authHeader) {
          const parts = authHeader.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
          }
        }
      }

      if (!token) {
        return next(new Error('未提供认证令牌'));
      }

      // 2. 验证 token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return next(new Error('认证令牌已过期'));
        }
        if (error.name === 'JsonWebTokenError') {
          return next(new Error('无效的认证令牌'));
        }
        throw error;
      }

      // 3. 从数据库获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          subscription: true
        }
      });

      if (!user) {
        return next(new Error('用户不存在'));
      }

      // 4. 检查用户状态
      if (!user.isActive) {
        return next(new Error('账号已被禁用'));
      }

      // 5. 检查订阅是否过期
      if (user.subscription && new Date() > user.subscription.endDate) {
        return next(new Error('订阅已过期，请续费'));
      }

      // 6. 将用户信息附加到 socket
      socket.userId = user.id;
      socket.username = user.username;
      socket.email = user.email;
      socket.isAdmin = user.isAdmin;

      logger.debug(`✅ Socket 认证成功: 用户 ${user.username} (${user.id})`);

      // 认证成功
      next();
    } catch (error) {
      logger.error('Socket 认证错误:', error.message);
      next(new Error('认证失败'));
    }
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

    // 注册认证中间件
    this.io.use((socket, next) => this.authenticateSocket(socket, next));

    this.setupEventHandlers();
    this.setupRustPlusListeners();

    console.log('✅ WebSocket 服务已启动（已启用认证）');
  }

  /**
   * 设置客户端事件处理
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // 用户连接时加入专属房间
      const roomName = `user:${socket.userId}`;
      socket.join(roomName);

      logger.info(`👤 用户 ${socket.username} (${socket.userId}) 已连接 WebSocket`);
      logger.debug(`   已加入房间: ${roomName}`);

      // 客户端请求连接到 Rust+ 服务器
      socket.on('server:connect', async (config) => {
        try {
          // 参数验证
          if (!config || !config.serverId) {
            return socket.emit('server:connect:error', { error: '缺少必要参数: serverId' });
          }
          // 检查是否已连接
          if (rustPlusService.isConnected(config.serverId)) {
            return socket.emit('server:connect:error', { serverId: config.serverId, error: '服务器已连接' });
          }
          await rustPlusService.connect(config);
          socket.emit('server:connect:success', { serverId: config.serverId });
        } catch (error) {
          socket.emit('server:connect:error', {
            serverId: config?.serverId,
            error: error.message
          });
        }
      });

      // 断开服务器连接
      socket.on('server:disconnect', async (serverId) => {
        try {
          if (!serverId) {
            return socket.emit('server:disconnect:error', { error: '缺少 serverId' });
          }
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
      socket.on('message:send', async ({ serverId, message } = {}) => {
        try {
          if (!serverId || !message) {
            return socket.emit('message:send:error', { error: '缺少 serverId 或 message' });
          }
          await rustPlusService.sendTeamMessage(serverId, message);
          socket.emit('message:send:success', { serverId, message });
        } catch (error) {
          socket.emit('message:send:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 获取聊天历史
      socket.on('chat:history', async ({ serverId } = {}) => {
        try {
          if (!serverId) {
            return socket.emit('chat:history:error', { error: '缺少 serverId' });
          }
          const messages = await rustPlusService.getTeamChat(serverId);
          socket.emit('chat:history:success', { serverId, messages });
        } catch (error) {
          socket.emit('chat:history:error', {
            serverId,
            error: error.message
          });
        }
      });

      // 控制设备
      socket.on('device:control', async ({ serverId, entityId, value } = {}) => {
        try {
          if (!serverId || entityId === undefined || value === undefined) {
            return socket.emit('device:control:error', { error: '缺少必要参数' });
          }
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
      socket.on('device:info', async ({ serverId, entityId } = {}) => {
        try {
          if (!serverId || entityId === undefined) {
            return socket.emit('device:info:error', { error: '缺少必要参数' });
          }
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
          if (!serverId) {
            return socket.emit('server:info:error', { error: '缺少 serverId' });
          }
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

      // 获取完整地图数据（包含图片）
      socket.on('map:get', async (serverId) => {
        try {
          // 并行获取地图和服务器信息
          const [map, serverInfo] = await Promise.all([
            rustPlusService.getMap(serverId),
            rustPlusService.getServerInfo(serverId).catch(() => null)
          ]);

          // 将 jpgImage Buffer 转换为 base64 字符串，方便前端处理
          if (map && map.jpgImage) {
            map.jpgImage = Buffer.from(map.jpgImage).toString('base64');
          }

          // 合并服务器信息中的 seed 和 mapSize 到地图数据
          if (serverInfo) {
            if (serverInfo.seed) map.seed = serverInfo.seed;
            if (serverInfo.mapSize) map.size = serverInfo.mapSize;
          }

          socket.emit('map:get:success', { serverId, map });
        } catch (error) {
          socket.emit('map:get:error', {
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
        logger.info(`👋 用户 ${socket.username} (${socket.userId}) 断开 WebSocket 连接`);
      });
    });
  }

  /**
   * 监听 Rust+ 服务事件并广播给所有客户端
   */
  setupRustPlusListeners() {
    // 防止重复注册监听器
    if (this.rustPlusListenersInitialized) {
      return;
    }
    this.rustPlusListenersInitialized = true;

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
      logger.debug(`💬 [${data.name}]: ${data.message}`);
    });

    // 队伍命令
    rustPlusService.on('team:command', (data) => {
      this.io.emit('team:command', data);
      logger.debug(`🎮 [命令 ${data.name}]: ${data.message}`);
    });

    // 队伍变化
    rustPlusService.on('team:changed', (data) => {
      this.io.emit('team:changed', data);
    });

    // 玩家死亡
    rustPlusService.on('player:died', (data) => {
      this.io.emit('player:died', data);
    });

    // 玩家复活/重生
    rustPlusService.on('player:spawned', (data) => {
      this.io.emit('player:spawned', data);
    });

    // 玩家上线
    rustPlusService.on('player:online', (data) => {
      this.io.emit('player:online', data);
    });

    // 玩家下线
    rustPlusService.on('player:offline', (data) => {
      this.io.emit('player:offline', data);
    });

    // 氏族变化
    rustPlusService.on('clan:changed', (data) => {
      this.io.emit('clan:changed', data);
    });

    // 氏族消息
    rustPlusService.on('clan:message', (data) => {
      this.io.emit('clan:message', data);
    });

    // 设备状态变化
    rustPlusService.on('entity:changed', (data) => {
      this.io.emit('entity:changed', data);
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
