import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import globalServiceManager from './global-manager.service.js';
import logger from '../utils/logger.js';
import distributedSessionService from './distributed-session.service.js';
import { isSubscriptionActive } from '../middleware/auth.middleware.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.globalServiceListenersInitialized = false;
    this.eventListeners = new Map(); // 存储监听器引用以便清理
    this.distributedServiceListenersInitialized = false;
    this.distributedEventListeners = new Map();
    this.distributedSessionCache = new Map(); // key: userId:serverId -> status
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
      const [userRows] = await db.query(
        'SELECT id, username, email, isActive, isAdmin FROM users WHERE id = ?',
        [decoded.userId]
      );

      const user = userRows[0];

      if (!user) {
        return next(new Error('用户不存在'));
      }

      // 4. 检查用户状态
      if (!user.isActive) {
        return next(new Error('账号已被禁用'));
      }

      // 5. 将用户信息附加到 socket（订阅状态在每次写操作时实时校验，不缓存握手快照）
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

  _getSessionCacheKey(userId, serverId) {
    return `${userId}:${serverId}`;
  }

  _setDistributedSessionState(userId, serverId, status) {
    const key = this._getSessionCacheKey(userId, serverId);
    if (status) {
      this.distributedSessionCache.set(key, status);
    } else {
      this.distributedSessionCache.delete(key);
    }
  }

  _normalizeMapPayload(mapPayload) {
    if (!mapPayload || typeof mapPayload !== 'object') return mapPayload;
    if (mapPayload.jpgImageBase64 && !mapPayload.jpgImage) {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImageBase64, 'base64');
      return mapPayload;
    }
    if (mapPayload.jpgImage?.__type === 'buffer-base64' && typeof mapPayload.jpgImage.data === 'string') {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage.data, 'base64');
      return mapPayload;
    }
    if (typeof mapPayload.jpgImage === 'string') {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage, 'base64');
      return mapPayload;
    }
    if (mapPayload.jpgImage?.type === 'Buffer' && Array.isArray(mapPayload.jpgImage.data)) {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage.data);
      return mapPayload;
    }
    return mapPayload;
  }

  createDistributedUserService(socket) {
    const ensureSession = async (serverId, reason) => {
      const result = await distributedSessionService.openSession({
        userId: socket.userId,
        serverId,
        reason,
      });
      if (result.status === 'queued') {
        const error = new Error('连接排队中，请稍后重试');
        error.code = 'SESSION_QUEUED';
        throw error;
      }
      return result;
    };

    const dispatch = async (serverId, action, payload = {}, timeoutMs) => {
      let response = await distributedSessionService.dispatchCommand({
        userId: socket.userId,
        serverId,
        action,
        payload,
        timeoutMs,
      });

      if (response.status === 'missing_session') {
        await ensureSession(serverId, `command:${action}`);
        response = await distributedSessionService.dispatchCommand({
          userId: socket.userId,
          serverId,
          action,
          payload,
          timeoutMs,
        });
      }

      if (response.status === 'queued') {
        socket.emit('server:connect:queued', { serverId, reason: response.reason });
        const error = new Error('连接排队中，请稍后重试');
        error.code = 'SESSION_QUEUED';
        throw error;
      }
      if (response.status !== 'success') {
        throw new Error(response.error || '分布式命令执行失败');
      }
      return response.result;
    };

    const adapter = {
      isConnected: (serverId) => {
        const key = this._getSessionCacheKey(socket.userId, serverId);
        return this.distributedSessionCache.get(key) === 'CONNECTED';
      },
      connect: async (config) => {
        const result = await ensureSession(config.serverId, 'socket_connect');
        if (result.status === 'connected') {
          this._setDistributedSessionState(socket.userId, config.serverId, 'CONNECTED');
        } else {
          this._setDistributedSessionState(socket.userId, config.serverId, 'ASSIGNED');
        }
        return result;
      },
      disconnect: async (serverId) => {
        await distributedSessionService.closeSession({
          userId: socket.userId,
          serverId,
          reason: 'socket_disconnect',
        });
        this._setDistributedSessionState(socket.userId, serverId, null);
      },
      sendTeamMessage: async (serverId, message) => dispatch(serverId, 'sendTeamMessage', { message }),
      getTeamChat: async (serverId) => dispatch(serverId, 'getTeamChat', {}),
      setEntityValue: async (serverId, entityId, value) => dispatch(serverId, 'setEntityValue', { entityId, value }),
      getEntityInfo: async (serverId, entityId) => dispatch(serverId, 'getEntityInfo', { entityId }),
      getServerInfo: async (serverId) => dispatch(serverId, 'getServerInfo', {}),
      getTeamInfo: async (serverId) => dispatch(serverId, 'getTeamInfo', {}),
      getMap: async (serverId) => this._normalizeMapPayload(await dispatch(serverId, 'getMap', {})),
      getMapMarkers: async (serverId) => dispatch(serverId, 'getMapMarkers', {}),
      getTime: async (serverId) => dispatch(serverId, 'getTime', {}),
      turnSmartSwitchOn: async (serverId, entityId) => dispatch(serverId, 'turnSmartSwitchOn', { entityId }),
      turnSmartSwitchOff: async (serverId, entityId) => dispatch(serverId, 'turnSmartSwitchOff', { entityId }),
      subscribeCamera: async (serverId, cameraId) => dispatch(serverId, 'subscribeCamera', { cameraId }),
      unsubscribeCamera: async (serverId, cameraId) => dispatch(serverId, 'unsubscribeCamera', { cameraId }),
      cameraMove: async (serverId, cameraId, buttons, x, y) => dispatch(serverId, 'cameraMove', { cameraId, buttons, x, y }),
      cameraZoom: async (serverId, cameraId) => dispatch(serverId, 'cameraZoom', { cameraId }),
      cameraShoot: async (serverId, cameraId) => dispatch(serverId, 'cameraShoot', { cameraId }),
      cameraReload: async (serverId, cameraId) => dispatch(serverId, 'cameraReload', { cameraId }),
    };

    return { rustPlusService: adapter };
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

      // 写操作前实时校验订阅（过期立即拦截，不依赖握手快照）
      const ensureSubscription = async (errorEvent, extra = {}) => {
        if (await isSubscriptionActive(socket.userId)) {
          return true;
        }
        socket.emit(errorEvent, {
          ...extra,
          error: '订阅已过期，续费后即可使用此功能',
          code: 'SUBSCRIPTION_EXPIRED',
        });
        return false;
      };

      // 客户端请求连接到 Rust+ 服务器
      socket.on('server:connect', async (data) => {
        try {
          // 参数验证 - 只接收 serverId
          const serverId = typeof data === 'string' ? data : data?.serverId;
          if (!serverId) {
            return socket.emit('server:connect:error', { error: '缺少必要参数: serverId' });
          }

          if (!(await ensureSubscription('server:connect:error', { serverId }))) {
            return;
          }

          const userService = getUserService();

          // 检查是否已连接
          if (userService.rustPlusService.isConnected(serverId)) {
            return socket.emit('server:connect:error', { serverId, error: '服务器已连接' });
          }

          // 从数据库获取服务器配置，同时验证所有权
          const [serverRows] = await db.query(
            'SELECT * FROM servers WHERE id = ? AND userId = ?',
            [serverId, socket.userId]
          );

          const server = serverRows[0];

          if (!server) {
            return socket.emit('server:connect:error', { serverId, error: '服务器不存在或无权访问' });
          }

          // 使用数据库中的安全配置连接
          const connectResult = await userService.rustPlusService.connect({
            serverId: server.id,
            ip: server.ip,
            port: server.port,
            playerId: server.playerId,
            playerToken: server.playerToken
          });
          if (connectResult?.queued) {
            return socket.emit('server:connect:queued', {
              serverId,
              reason: connectResult.reason,
              queueId: connectResult.queueId,
              queuePosition: connectResult.queuePosition
            });
          }
          if (connectResult?.assigned && !connectResult.connected) {
            return socket.emit('server:connect:queued', {
              serverId,
              reason: connectResult.reason || 'SESSION_CONNECTING',
              sessionId: connectResult.sessionId,
              nodeId: connectResult.nodeId
            });
          }
          socket.emit('server:connect:success', {
            serverId,
            sessionId: connectResult?.sessionId,
            nodeId: connectResult?.nodeId
          });
        } catch (error) {
          if (error.code === 'SESSION_QUEUED') {
            return;
          }
          socket.emit('server:connect:error', {
            serverId: typeof data === 'string' ? data : data?.serverId,
            error: error.message
          });
        }
      });

      // 断开服务器连接
      socket.on('server:disconnect', async (data) => {
        const serverId = typeof data === 'string' ? data : data?.serverId;
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

      // 发送队伍消息（需要有效订阅）
      socket.on('message:send', async ({ serverId, message } = {}) => {
        try {
          if (!(await ensureSubscription('message:send:error', { serverId }))) {
            return;
          }

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

      // 控制设备（需要有效订阅）
      socket.on('device:control', async ({ serverId, entityId, value } = {}) => {
        try {
          if (!(await ensureSubscription('device:control:error', { serverId, entityId }))) {
            return;
          }

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
          const payloadInfo = { ...info };

          if (userService.commandsService) {
            const now = Date.now();
            const players = Number.parseInt(payloadInfo.players, 10) || 0;
            userService.commandsService.recordPopSample(serverId, players, now);
            payloadInfo.popTrend = userService.commandsService.getPopulationTrend(serverId, players, now);
            payloadInfo.popSeries = userService.commandsService.getPopulationSeries(serverId, {
              now,
              windowMs: userService.commandsService.POP_CURVE_WINDOW_MS,
              maxPoints: 240
            });
          }

          socket.emit('server:info:success', { serverId, info: payloadInfo });
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
          if (!(await ensureSubscription('switch:on:error', { serverId, entityId }))) {
            return;
          }
          const userService = getUserService();
          await userService.rustPlusService.turnSmartSwitchOn(serverId, entityId);
          socket.emit('switch:on:success', { serverId, entityId });
        } catch (error) {
          socket.emit('switch:on:error', { serverId, entityId, error: error.message });
        }
      });

      socket.on('switch:off', async ({ serverId, entityId }) => {
        try {
          if (!(await ensureSubscription('switch:off:error', { serverId, entityId }))) {
            return;
          }
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
          if (!(await ensureSubscription('camera:subscribe:error', { serverId, cameraId }))) {
            return;
          }
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
          if (!(await ensureSubscription('camera:move:error', { serverId, cameraId }))) {
            return;
          }
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraMove(serverId, cameraId, buttons, x, y);
          socket.emit('camera:move:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:move:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:zoom', async ({ serverId, cameraId }) => {
        try {
          if (!(await ensureSubscription('camera:zoom:error', { serverId, cameraId }))) {
            return;
          }
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraZoom(serverId, cameraId);
          socket.emit('camera:zoom:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:zoom:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:shoot', async ({ serverId, cameraId }) => {
        try {
          if (!(await ensureSubscription('camera:shoot:error', { serverId, cameraId }))) {
            return;
          }
          const userService = getUserService();
          const result = await userService.rustPlusService.cameraShoot(serverId, cameraId);
          socket.emit('camera:shoot:success', { serverId, cameraId, result });
        } catch (error) {
          socket.emit('camera:shoot:error', { serverId, cameraId, error: error.message });
        }
      });

      socket.on('camera:reload', async ({ serverId, cameraId }) => {
        try {
          if (!(await ensureSubscription('camera:reload:error', { serverId, cameraId }))) {
            return;
          }
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

    // 辅助函数：注册监听器并存储引用
    const addListener = (eventName, handler) => {
      globalServiceManager.on(eventName, handler);
      this.eventListeners.set(eventName, handler);
    };

    // === 游戏服务器连接事件 ===

    addListener('server:connected', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:connected', data);
    });

    addListener('server:disconnected', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:disconnected', data);
    });

    addListener('server:error', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:error', data);
    });

    addListener('server:reconnecting', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:reconnecting', data);
    });

    // === 游戏事件 (Cargo, Heli, etc.) ===

    addListener('cargo:spawn', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:spawn', data);
    });

    addListener('cargo:egress', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:egress', data);
    });

    addListener('cargo:dock', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:dock', data);
    });

    addListener('cargo:leave', (data) => {
      this.io.to(`user:${data.userId}`).emit('cargo:leave', data);
    });

    addListener('travelling_vendor:spawn', (data) => {
      this.io.to(`user:${data.userId}`).emit('travelling_vendor:spawn', data);
    });

    addListener('travelling_vendor:leave_warning', (data) => {
      this.io.to(`user:${data.userId}`).emit('travelling_vendor:leave_warning', data);
    });

    addListener('travelling_vendor:leave', (data) => {
      this.io.to(`user:${data.userId}`).emit('travelling_vendor:leave', data);
    });

    addListener('heli:spawn', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:spawn', data);
    });

    addListener('heli:downed', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:downed', data);
    });

    addListener('heli:leave', (data) => {
      this.io.to(`user:${data.userId}`).emit('heli:leave', data);
    });

    addListener('player:died', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:died', data);
    });

    addListener('player:online', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:online', data);
    });

    addListener('player:offline', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:offline', data);
    });

    addListener('player:afk', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:afk', data);
    });

    addListener('player:contribution', (data) => {
      this.io.to(`user:${data.userId}`).emit('player:contribution', data);
    });

    // === 自动化事件 ===

    addListener('automation:executed', (data) => {
      this.io.to(`user:${data.userId}`).emit('automation:executed', data);
    });

    // === 队伍和氏族事件 ===

    addListener('team:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('team:message', data);
      logger.debug(`💬 [${data.name}]: ${data.message}`);
    });

    addListener('team:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('team:changed', data);
    });

    addListener('clan:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('clan:changed', data);
    });

    addListener('clan:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('clan:message', data);
    });

    // === 设备和警报事件 ===

    addListener('entity:changed', (data) => {
      this.io.to(`user:${data.userId}`).emit('entity:changed', data);
    });

    addListener('alarm:triggered', (data) => {
      this.io.to(`user:${data.userId}`).emit('alarm:triggered', data);
    });

    // === 摄像头事件 ===

    addListener('camera:subscribing', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:subscribing', data);
    });

    addListener('camera:subscribed', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:subscribed', data);
    });

    addListener('camera:unsubscribed', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:unsubscribed', data);
    });

    addListener('camera:render', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:render', data);
    });

    addListener('camera:rays', (data) => {
      this.io.to(`user:${data.userId}`).emit('camera:rays', data);
    });

    // === FCM 配对事件 ===

    addListener('server:paired', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:paired', data);
    });

    addListener('entity:paired', (data) => {
      this.io.to(`user:${data.userId}`).emit('entity:paired', data);
    });

    addListener('entity:paired:success', (data) => {
      this.io.to(`user:${data.userId}`).emit('entity:paired:success', data);
      // 兼容前端设备列表监听事件名
      this.io.to(`user:${data.userId}`).emit('device:paired', data);
    });

    addListener('fcm:listening', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:listening', data);
    });

    addListener('fcm:stopped', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:stopped', data);
    });

    addListener('fcm:error', (data) => {
      this.io.to(`user:${data.userId}`).emit('fcm:error', data);
    });

    // === 原始消息（调试）===

    addListener('rust:message', (data) => {
      this.io.to(`user:${data.userId}`).emit('rust:message', data);
    });

    // === 玩家追踪事件 ===

    addListener('tracking:online', (data) => {
      this.io.to(`user:${data.userId}`).emit('tracking:online', data);
    });

    addListener('tracking:offline', (data) => {
      this.io.to(`user:${data.userId}`).emit('tracking:offline', data);
    });

    addListener('tracking:server_change', (data) => {
      this.io.to(`user:${data.userId}`).emit('tracking:server_change', data);
    });

    logger.info('✅ GlobalServiceManager 事件监听器已设置（房间隔离模式）');
  }

  setupDistributedSessionListeners() {
    if (this.distributedServiceListenersInitialized) {
      return;
    }
    this.distributedServiceListenersInitialized = true;

    const addListener = (eventName, handler) => {
      distributedSessionService.on(eventName, handler);
      this.distributedEventListeners.set(eventName, handler);
    };

    addListener('session:queued', (data) => {
      this.io.to(`user:${data.userId}`).emit('server:connect:queued', data);
      this._setDistributedSessionState(data.userId, data.serverId, 'QUEUED');
    });

    addListener('session:assigned', (data) => {
      this._setDistributedSessionState(data.userId, data.serverId, 'ASSIGNED');
      if (data.fromQueue) {
        this.io.to(`user:${data.userId}`).emit('server:connect:success', {
          serverId: data.serverId,
          sessionId: data.sessionId,
          nodeId: data.nodeId,
          fromQueue: true
        });
      }
    });

    addListener('session:connecting', (data) => {
      this._setDistributedSessionState(data.userId, data.serverId, 'CONNECTING');
      this.io.to(`user:${data.userId}`).emit('server:reconnecting', data);
    });

    addListener('session:connected', (data) => {
      this._setDistributedSessionState(data.userId, data.serverId, 'CONNECTED');
      this.io.to(`user:${data.userId}`).emit('server:connected', data);
    });

    addListener('session:failed', (data) => {
      this._setDistributedSessionState(data.userId, data.serverId, null);
      this.io.to(`user:${data.userId}`).emit('server:error', {
        userId: data.userId,
        serverId: data.serverId,
        error: data.error,
        sessionId: data.sessionId,
        nodeId: data.nodeId
      });
    });

    addListener('session:disconnected', (data) => {
      this._setDistributedSessionState(data.userId, data.serverId, null);
      this.io.to(`user:${data.userId}`).emit('server:disconnected', data);
    });
  }

  /**
   * 清理所有事件监听器
   */
  cleanup() {
    // 移除 GlobalServiceManager 上的监听器
    for (const [eventName, handler] of this.eventListeners) {
      globalServiceManager.off(eventName, handler);
    }
    this.eventListeners.clear();
    this.globalServiceListenersInitialized = false;

    for (const [eventName, handler] of this.distributedEventListeners) {
      distributedSessionService.off(eventName, handler);
    }
    this.distributedEventListeners.clear();
    this.distributedServiceListenersInitialized = false;
    this.distributedSessionCache.clear();

    // 关闭 Socket.IO
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
      this.io = null;
    }

    logger.info('✅ WebSocket 服务已清理');
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
   * 断开指定用户的所有 WebSocket 连接
   * @param {string} userId - 用户 ID
   * @param {string} reason - 断开原因
   */
  disconnectUser(userId, reason = '账号已被删除') {
    if (!this.io) return;

    const userRoom = `user:${userId}`;

    // 获取该用户房间内的所有 socket
    const sockets = this.io.sockets.adapter.rooms.get(userRoom);

    if (sockets && sockets.size > 0) {
      console.log(`🔌 断开用户 ${userId} 的 ${sockets.size} 个连接 (原因: ${reason})`);

      // 向用户发送断开通知
      this.io.to(userRoom).emit('force:disconnect', { reason });

      // 断开所有连接
      for (const socketId of sockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
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

