import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import globalServiceManager from './global-manager.service.js';
import logger from '../utils/logger.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.globalServiceListenersInitialized = false;
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
      const user = await prisma.users.findUnique({
        where: { id: decoded.userId },
        include: {
          subscriptions: true
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
      if (user.subscriptions && new Date() > user.subscriptions.endDate) {
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
    this.setupGlobalServiceListeners();

    console.log('✅ WebSocket 服务已启动（已启用认证 + 房间隔离）');
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

      // 获取用户服务实例的辅助函数
      const getUserService = () => {
        const userService = globalServiceManager.getUserService(socket.userId);
        if (!userService) {
          throw new Error('用户服务未初始化，请联系管理员');
        }
        return userService;
      };

      // 客户端请求连接到 Rust+ 服务器
      socket.on('server:connect', async (config) => {
        try {
          // 参数验证
          if (!config || !config.serverId) {
            return socket.emit('server:connect:error', { error: '缺少必要参数: serverId' });
          }

          const userService = getUserService();

          // 检查是否已连接
          if (userService.rustPlusService.isConnected(config.serverId)) {
            return socket.emit('server:connect:error', { serverId: config.serverId, error: '服务器已连接' });
          }

          await userService.rustPlusService.connect(config);
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

          const userService = getUserService();
          await userService.rustPlusService.disconnect(serverId);
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

          const userService = getUserService();
          await userService.rustPlusService.sendTeamMessage(serverId, message);
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

          const userService = getUserService();
          const messages = await userService.rustPlusService.getTeamChat(serverId);
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

          const userService = getUserService();
          const result = await userService.rustPlusService.setEntityValue(serverId, entityId, value);
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

          const userService = getUserService();
          const info = await userService.rustPlusService.getEntityInfo(serverId, entityId);
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

          const userService = getUserService();
          const info = await userService.rustPlusService.getServerInfo(serverId);
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
          const userService = getUserService();
          const teamInfo = await userService.rustPlusService.getTeamInfo(serverId);
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
          const userService = getUserService();
          const mapInfo = await userService.rustPlusService.getMap(serverId);
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
          const userService = getUserService();
          const markers = await userService.rustPlusService.getMapMarkers(serverId);
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
          const userService = getUserService();

          // 并行获取地图和服务器信息
          const [map, serverInfo] = await Promise.all([
            userService.rustPlusService.getMap(serverId),
            userService.rustPlusService.getServerInfo(serverId).catch(() => null)
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
          const userService = getUserService();
          const time = await userService.rustPlusService.getTime(serverId);
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
          const userService = getUserService();
          await userService.rustPlusService.turnSmartSwitchOn(serverId, entityId);
          socket.emit('switch:on:success', { serverId, entityId });
        } catch (error) {
          socket.emit('switch:on:error', { serverId, entityId, error: error.message });
        }
      });

      socket.on('switch:off', async ({ serverId, entityId }) => {
        try {
          const userService = getUserService();
          await userService.rustPlusService.turnSmartSwitchOff(serverId, entityId);
          socket.emit('switch:off:success', { serverId, entityId });
        } catch (error) {
          socket.emit('switch:off:error', { serverId, entityId, error: error.message });
        }
      });

      // 摄像头订阅/控制
      socket.on('camera:subscribe', async ({ serverId, cameraId }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.subscribeCamera(serverId, cameraId);
          socket.emit('camera:subscribe:success', result);
        } catch (error) {
          socket.emit('camera:subscribe:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:unsubscribe', async ({ serverId, cameraId }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.unsubscribeCamera(serverId, cameraId);
          socket.emit('camera:unsubscribe:success', result);
        } catch (error) {
          socket.emit('camera:unsubscribe:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:move', async ({ serverId, cameraId, buttons, x, y }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraMove(serverId, cameraId, buttons, x, y);
          socket.emit('camera:move:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:move:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:zoom', async ({ serverId, cameraId }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraZoom(serverId, cameraId);
          socket.emit('camera:zoom:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:zoom:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:shoot', async ({ serverId, cameraId }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraShoot(serverId, cameraId);
          socket.emit('camera:shoot:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:shoot:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:reload', async ({ serverId, cameraId }) => {
        try {
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraReload(serverId, cameraId);
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
   * 监听 GlobalServiceManager 事件并广播给对应用户的房间
   * 使用房间隔离：io.to(`user:${userId}`).emit() 代替 io.emit()
   */
  setupGlobalServiceListeners() {
    // 防止重复注册监听器
    if (this.globalServiceListenersInitialized) {
      return;
    }
    this.globalServiceListenersInitialized = true;

    // === 游戏服务器连接事件 ===

    globalServiceManager.on('server:connected', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:connected', data);
    });

    globalServiceManager.on('server:disconnected', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:disconnected', data);
    });

    globalServiceManager.on('server:error', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:error', data);
    });

    globalServiceManager.on('server:reconnecting', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:reconnecting', data);
    });

    // === 游戏事件 (Cargo, Heli, etc.) ===

    globalServiceManager.on('cargo:spawn', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:spawn', data);
    });

    globalServiceManager.on('cargo:egress', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:egress', data);
    });

    globalServiceManager.on('cargo:dock', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:dock', data);
    });

    globalServiceManager.on('cargo:leave', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:leave', data);
    });

    globalServiceManager.on('heli:spawn', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:spawn', data);
    });

    globalServiceManager.on('heli:downed', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:downed', data);
    });

    globalServiceManager.on('heli:leave', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:leave', data);
    });

    globalServiceManager.on('player:died', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:died', data);
    });

    globalServiceManager.on('player:online', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:online', data);
    });

    globalServiceManager.on('player:offline', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:offline', data);
    });

    globalServiceManager.on('player:afk', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:afk', data);
    });

    globalServiceManager.on('player:contribution', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:contribution', data);
    });

    // === 自动化事件 ===

    globalServiceManager.on('automation:executed', (data) => {
      this.io.to(`user:${data.userId}`).emit('automation:executed', data);
    });

    // === 队伍和氏族事件 ===

    globalServiceManager.on('team:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('team:message', data);
      logger.debug(`💬 [${data.name}]: ${data.message}`);
    });

    globalServiceManager.on('team:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('team:changed', data);
    });

    globalServiceManager.on('clan:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('clan:changed', data);
    });

    globalServiceManager.on('clan:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('clan:message', data);
    });

    // === 设备和警报事件 ===

    globalServiceManager.on('entity:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('entity:changed', data);
    });

    globalServiceManager.on('alarm:triggered', (data) => {
      this.io.to(`user:${data.userId}`).emit('alarm:triggered', data);
    });

    // === 摄像头事件 ===

    globalServiceManager.on('camera:subscribing', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:subscribing', data);
    });

    globalServiceManager.on('camera:subscribed', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:subscribed', data);
    });

    globalServiceManager.on('camera:unsubscribed', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:unsubscribed', data);
    });

    globalServiceManager.on('camera:render', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:render', data);
    });

    globalServiceManager.on('camera:rays', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:rays', data);
    });

    // === FCM 配对事件 ===

    globalServiceManager.on('server:paired', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:paired', data);
    });

    globalServiceManager.on('entity:paired', (data) => {
      this.io.to(`user:${data.userId}`).emit('entity:paired', data);
    });

    globalServiceManager.on('fcm:listening', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:listening', data);
    });

    globalServiceManager.on('fcm:stopped', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:stopped', data);
    });

    globalServiceManager.on('fcm:error', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:error', data);
    });

    // === 原始消息（调试）===

    globalServiceManager.on('rust:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('rust:message', data);
    });

    logger.info('✅ GlobalServiceManager 事件监听器已设置（房间隔离模式）');
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
