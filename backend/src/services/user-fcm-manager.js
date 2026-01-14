/**
 * UserFCMManager - 用户级别的 FCM 推送监听管理器
 * 每个用户一个实例，管理该用户的 FCM 推送监听
 */

import EventEmitter from 'events';
import tls from 'tls';
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';
import { SocksClient } from 'socks';
import logger from '../utils/logger.js';

// Rust Companion App 公开参数（来自官方 CLI）
const FCM_CONFIG = {
  apiKey: "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY",
  projectId: "rust-companion-app",
  gcmSenderId: "976529667804",
  gmsAppId: "1:976529667804:android:d6f1ddeb4403b338fea619",
  androidPackageName: "com.facepunch.rust.companion",
  androidPackageCert: "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD"
};

class UserFCMManager extends EventEmitter {
  constructor(userId) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    this.userId = userId;
    this.fcmListener = null;
    this.credentials = null;
    this.isListening = false;
    this.reconnectTimer = null;
    this.lastDisconnectTime = null;
    this.proxyAgent = null; // 代理 Agent (用于 HTTP 请求)
    this.proxyConfig = null; // SOCKS5 代理配置 (用于 FCM 连接)
    this._manualStop = false;
    this.lastError = null; // 最近一次错误信息

    logger.debug(`👤 UserFCMManager 已创建 (userId: ${userId})`);
  }

  /**
   * 设置代理 Agent（从 ProxyService 获取）
   */
  setProxyAgent(proxyAgent) {
    this.proxyAgent = proxyAgent;
    logger.info(`✅ 用户 ${this.userId} FCM 服务已配置 HTTP 代理`);
  }

  /**
   * 设置 SOCKS5 代理配置（用于 FCM 连接）
   * @param {Object} config - { host: '127.0.0.1', port: 10808 }
   */
  setProxyConfig(config) {
    this.proxyConfig = config;
    logger.info(`✅ 用户 ${this.userId} FCM 服务已配置 SOCKS5 代理: ${config.host}:${config.port}`);
  }

  /**
   * 完整的 FCM 注册流程（不包含 Steam 登录）
   * 这个方法会：
   * 1. 注册 FCM 设备
   * 2. 获取 Expo Push Token
   * 返回凭证和 tokens，用户需要自己完成 Steam 登录并调用 completeRegistration
   */
  async registerFCM() {
    try {
      logger.info(`🔐 用户 ${this.userId} 开始 FCM 注册...`);

      logger.info('📱 正在注册 FCM 设备...');
      const fcmCredentials = await AndroidFCM.register(
        FCM_CONFIG.apiKey,
        FCM_CONFIG.projectId,
        FCM_CONFIG.gcmSenderId,
        FCM_CONFIG.gmsAppId,
        FCM_CONFIG.androidPackageName,
        FCM_CONFIG.androidPackageCert
      );

      logger.info('✅ FCM 设备注册成功');
      logger.debug(`   Android ID: ${fcmCredentials.gcm.androidId}`);
      logger.debug(`   FCM Token: ${fcmCredentials.fcm.token.substring(0, 50)}...`);

      // 获取 Expo Push Token
      logger.info('📱 正在获取 Expo Push Token...');
      const expoPushToken = await this.getExpoPushToken(fcmCredentials.fcm.token);

      logger.info('✅ Expo Push Token 获取成功');
      logger.debug(`   Token: ${expoPushToken.substring(0, 50)}...`);

      return {
        fcmCredentials,
        expoPushToken,
      };
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} FCM 注册失败:`, error.message);
      throw error;
    }
  }

  /**
   * 完成注册流程（使用 Auth Token）
   * 用户在 Steam 登录后获取 auth_token，调用此方法完成注册
   */
  async completeRegistration(fcmCredentials, expoPushToken, authToken) {
    try {
      logger.info(`🔐 用户 ${this.userId} 完成 Rust+ API 注册...`);

      // 注册到 Rust+ API
      await this.registerWithRustPlusAPI(authToken, expoPushToken);

      // 保存完整凭证
      this.credentials = {
        ...fcmCredentials,
        expo: { pushToken: expoPushToken },
        rustplus: { authToken: authToken },
      };

      logger.info(`✅ 用户 ${this.userId} 完整注册流程已完成`);
      return this.credentials;
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} 完成注册失败:`, error.message);
      throw error;
    }
  }

  /**
   * 使用已有凭证开始监听
   * @param {Object} credentials - FCM 凭证（可选，如果不提供则使用已加载的凭证）
   */
  async start(credentials = null) {
    if (this.isListening) {
      logger.warn(`⚠️  用户 ${this.userId} FCM 监听器已在运行`);
      return;
    }

    // 如果提供了新凭证，使用新凭证
    if (credentials) {
      this.credentials = credentials;
    }

    if (!this.credentials) {
      throw new Error(`用户 ${this.userId} 未找到 FCM 凭证，请先注册或加载凭证`);
    }

    if (!this.credentials.gcm) {
      throw new Error(`用户 ${this.userId} 凭证格式错误：需要 GCM 格式的凭证 (gcm.androidId, gcm.securityToken)`);
    }

    // 重置手动停止标志
    this._manualStop = false;

    logger.info(`👂 用户 ${this.userId} 开始监听 FCM 推送消息...`);
    logger.debug('📋 凭证信息:');
    const maskStr = (str) => str ? `${String(str).substring(0, 6)}****` : 'N/A';
    logger.debug(`   - Android ID: ${maskStr(this.credentials.gcm.androidId)}`);
    logger.debug(`   - Security Token: ${maskStr(this.credentials.gcm.securityToken)}`);

    // 创建 PushReceiverClient 监听器
    // 注意：androidId 和 securityToken 必须是字符串
    const androidId = String(this.credentials.gcm.androidId);
    const securityToken = String(this.credentials.gcm.securityToken);

    this.fcmListener = new PushReceiverClient(androidId, securityToken, []);

    // 监听数据接收事件（未加密的推送消息）
    this.fcmListener.on('ON_DATA_RECEIVED', (data) => {
      logger.debug(`📩 用户 ${this.userId} 收到未加密推送 (ON_DATA_RECEIVED)`);
      this.handleFCMMessage(data);
    });

    // 监听通知接收事件（加密后解密的推送消息）
    this.fcmListener.on('ON_NOTIFICATION_RECEIVED', (data) => {
      logger.debug(`📩 用户 ${this.userId} 收到加密推送 (ON_NOTIFICATION_RECEIVED)`);
      this.handleFCMMessage(data.notification || data);
    });

    // 添加连接成功事件监听
    this.fcmListener.on('connect', () => {
      logger.info(`🔗 用户 ${this.userId} FCM 连接已建立`);
      logger.info(`📡 用户 ${this.userId} 开始接收推送通知...`);
      this.lastError = null; // 连接成功，清除错误
    });

    // 添加断开连接事件监听
    this.fcmListener.on('disconnect', () => {
      const now = Date.now();

      // 如果是手动停止，不输出日志也不重连
      if (this._manualStop) {
        logger.debug(`用户 ${this.userId} FCM disconnect 事件触发（手动停止，忽略）`);
        return;
      }

      // 防止重复日志（1分钟内只输出一次）
      if (!this.lastDisconnectTime || (now - this.lastDisconnectTime) > 60000) {
        logger.warn(`⚠️  用户 ${this.userId} FCM 连接已断开`);
        logger.info(`💡 提示：FCM 断开不影响游戏内事件（死亡、聊天等）`);
        logger.info(`   → 游戏内事件通过 Rust+ WebSocket 接收`);
        logger.info(`   → FCM 仅用于接收配对推送（在游戏中点击 Pair）`);
        logger.info(`   → 将每 5 分钟尝试重连一次`);
        this.lastDisconnectTime = now;
      }

      this.isListening = false;

      // 清除之前的重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      // 5 分钟后重连
      this.reconnectTimer = setTimeout(async () => {
        if (!this.isListening && this.credentials && !this._manualStop) {
          try {
            logger.info(`🔄 用户 ${this.userId} 尝试重新连接 FCM...`);
            await this.start();
          } catch (error) {
            logger.error(`❌ 用户 ${this.userId} FCM 重连失败:`, error.message);
          }
        }
      }, 300000); // 5 分钟 = 300000 毫秒
    });

    // 监听错误
    this.fcmListener.on('error', (error) => {
      logger.error(`❌ 用户 ${this.userId} FCM 错误事件触发`);
      this.handleFCMError(error);
    });

    // 连接到 FCM - 如果配置了代理则通过代理连接
    try {
      logger.info(`🔌 用户 ${this.userId} 正在连接到 FCM 服务器...`);

      const CONNECT_TIMEOUT = 15000; // 15秒连接超时

      const connectPromise = this.proxyConfig
        ? this._connectWithProxy()
        : this.fcmListener.connect();

      // 使用 Promise.race 防止连接挂起
      await Promise.race([
        connectPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('FCM 连接超时 (可能由于网络受限，请配置代理)')), CONNECT_TIMEOUT))
      ]);

      this.isListening = true;
      logger.info(`✅ 用户 ${this.userId} FCM 连接流程已启动`);
      logger.info(`📡 用户 ${this.userId} 等待 connect 事件确认连接...`);

      this.emit('listening', { userId: this.userId });
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} FCM 连接失败:`, error.message);
      this.handleFCMError(error);

      // 如果连接失败，清理监听器防止后台无限重试导致的黑屏挂起
      if (this.fcmListener) {
        this.fcmListener.destroy();
        this.fcmListener = null;
      }

      throw error;
    }
  }

  /**
   * 测试凭证连接 (静态检查 + 尝试连接)
   * 不会影响当前运行状态
   */
  async testConnection(credentials) {
    logger.info(`🧪 用户 ${this.userId} 测试 FCM 凭证有效性...`);

    if (!credentials || !credentials.gcm) {
      throw new Error('无效的凭证格式');
    }

    // 动态导入避免循环依赖或加载问题
    const { default: PushReceiverClient } = await import('@liamcottle/push-receiver/src/client.js');
    const androidId = String(credentials.gcm.androidId);
    const securityToken = String(credentials.gcm.securityToken);

    // 使用临时 Client
    const testClient = new PushReceiverClient(androidId, securityToken, []);

    try {
      // 尝试连接
      await Promise.race([
        testClient.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 10000))
      ]);

      logger.info(`✅ 用户 ${this.userId} 凭证测试通过`);
      testClient.destroy();
      return true;

    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} 凭证测试失败:`, error.message);
      testClient.destroy();
      throw error;
    }
  }

  /**
   * 通过 SOCKS5 代理连接到 FCM
   */
  async _connectWithProxy() {
    const FCM_HOST = 'mtalk.google.com';
    const FCM_PORT = 5228;

    logger.info(`🌐 用户 ${this.userId} 通过 SOCKS5 代理 ${this.proxyConfig.host}:${this.proxyConfig.port} 连接到 FCM...`);

    // 1. 创建 SOCKS5 代理连接
    const proxyResult = await SocksClient.createConnection({
      proxy: {
        host: this.proxyConfig.host,
        port: this.proxyConfig.port,
        type: 5,
      },
      command: 'connect',
      destination: {
        host: FCM_HOST,
        port: FCM_PORT,
      },
      timeout: 30000,
    });

    logger.info(`✅ 用户 ${this.userId} SOCKS5 代理 TCP 连接已建立`);

    const proxySocket = proxyResult.socket;

    // 2. 初始化 protobuf
    await this.fcmListener.constructor.init();

    // 3. 在代理 socket 上进行 TLS 升级
    logger.info(`🔒 用户 ${this.userId} 升级为 TLS 连接...`);

    return new Promise((resolve, reject) => {
      let resolved = false;

      const done = (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (err) reject(err);
      };

      // 超时处理
      const timeout = setTimeout(() => {
        done(new Error('TLS 连接超时'));
        proxySocket.destroy();
      }, 30000);

      // 使用 tls.connect 升级连接
      const tlsSocket = tls.connect({
        socket: proxySocket,
        servername: FCM_HOST,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      });

      tlsSocket.setKeepAlive(true);

      // TLS 握手完成
      tlsSocket.once('secureConnect', async () => {
        logger.info(`✅ 用户 ${this.userId} TLS 握手完成`);

        try {
          // 设置到 fcmListener
          this.fcmListener._socket = tlsSocket;

          // 绑定事件
          tlsSocket.on('close', this.fcmListener._onSocketClose);
          tlsSocket.on('error', this.fcmListener._onSocketError);

          // 发送登录请求
          tlsSocket.write(this.fcmListener._loginBuffer());

          // 初始化 parser
          const { default: Parser } = await import('@liamcottle/push-receiver/src/parser.js');
          await Parser.init();

          this.fcmListener._parser = new Parser(tlsSocket);
          this.fcmListener._parser.on('message', this.fcmListener._onMessage);
          this.fcmListener._parser.on('error', this.fcmListener._onParserError);

          // 禁用库内部重连
          this.fcmListener._retry = () => {
            logger.debug(`🚫 用户 ${this.userId} 库内部重连已被禁用`);
          };

          logger.info(`✅ 用户 ${this.userId} FCM 代理连接完成`);
          this.fcmListener.emit('connect');
          done();
          resolve();
        } catch (err) {
          done(err);
        }
      });

      // 错误处理
      tlsSocket.once('error', (err) => {
        logger.error(`❌ 用户 ${this.userId} TLS 错误:`, err.message);
        tlsSocket.destroy();
        proxySocket.destroy();
        done(err);
      });

      proxySocket.once('error', (err) => {
        logger.error(`❌ 用户 ${this.userId} 代理 Socket 错误:`, err.message);
        tlsSocket.destroy();
        proxySocket.destroy();
        done(err);
      });

      proxySocket.once('close', (hadError) => {
        if (!resolved) {
          logger.error(`❌ 用户 ${this.userId} 代理连接被关闭, hadError:`, hadError);
          tlsSocket.destroy();
          done(new Error('代理连接被关闭'));
        }
      });
    });
  }

  /**
   * 停止监听
   * @param {boolean} preventReconnect - 是否阻止自动重连（默认 true）
   */
  stop(preventReconnect = true) {
    // 设置标志阻止 disconnect 事件触发重连
    if (preventReconnect) {
      this._manualStop = true;
    }

    if (this.fcmListener) {
      // 先清除库的内部重连定时器
      if (this.fcmListener._retryTimeout) {
        clearTimeout(this.fcmListener._retryTimeout);
        this.fcmListener._retryTimeout = null;
      }

      // 移除事件监听器，避免 destroy 触发 disconnect 事件
      this.fcmListener.removeAllListeners('disconnect');
      this.fcmListener.removeAllListeners('connect');
      this.fcmListener.removeAllListeners('ON_DATA_RECEIVED');
      this.fcmListener.removeAllListeners('ON_NOTIFICATION_RECEIVED');
      this.fcmListener.removeAllListeners('error');

      this.fcmListener.destroy();
      this.fcmListener = null;
      this.isListening = false;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      logger.info(`🛑 用户 ${this.userId} FCM 监听已停止`);
      this.emit('stopped', { userId: this.userId });
    }
  }

  /**
   * 处理接收到的 FCM 推送消息
   */
  handleFCMMessage(message) {
    logger.info(`\n========================================`);
    logger.info(`📨 用户 ${this.userId} 收到 FCM 推送消息！`);
    logger.info(`========================================`);
    logger.debug('原始消息类型:', typeof message);
    logger.debug('原始消息键:', Object.keys(message || {}));
    logger.debug('原始消息内容:');
    logger.debug(JSON.stringify(message, null, 2));
    logger.info(`========================================\n`);

    try {
      // PushReceiverClient 的消息格式可能是 { notification: {...} } 或 直接的 data
      let data = message;

      // 检查是否有 notification 包装
      if (message.notification) {
        logger.debug('📦 检测到 notification 包装');
        data = message.notification.data || message.notification;
      }

      // 检查是否有 data 字段
      if (message.data) {
        logger.debug('📦 检测到 data 字段');
        data = message.data;
      }

      if (!data) {
        logger.warn(`⚠️  用户 ${this.userId} 收到空消息`);
        return;
      }

      // 如果是 appData 数组格式，转换为对象
      if (data.appData && Array.isArray(data.appData)) {
        logger.debug('📦 检测到 appData 数组格式，正在转换...');
        const convertedData = {};
        for (const item of data.appData) {
          if (item.key && item.value !== undefined) {
            convertedData[item.key] = item.value;
          }
        }
        logger.debug('✅ 转换后的数据:', JSON.stringify(convertedData, null, 2));
        data = { ...data, ...convertedData };
      }

      // 解析消息数据 - body 可能是字符串或对象
      let body = {};
      if (data.body) {
        try {
          body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          logger.debug('📋 解析后的 body:', JSON.stringify(body, null, 2));
        } catch (e) {
          logger.warn(`⚠️  用户 ${this.userId} 无法解析消息 body:`, data.body);
        }
      }

      // 配对推送 - channelId 都是 'pairing'，需要根据 body.type 或 entityId 区分
      if (data.channelId === 'pairing') {
        logger.info(`📋 配对推送 body 数据:`, JSON.stringify(body, null, 2));

        // 检查是设备配对还是服务器配对
        // 设备配对会有 entityId 字段，或者 type 不是 'server'
        if (body.entityId) {
          // 这是设备/实体配对
          const entityInfo = {
            userId: this.userId,
            entityId: body.entityId,
            entityType: body.entityType,
            entityName: body.entityName || body.name || data.title,
            // serverId 是服务器的 ID
            serverId: body.id || body.serverId || body.server_id,
            type: 'entity'
          };

          logger.info(`🔌 用户 ${this.userId} 收到设备配对信息:`, entityInfo);
          this.emit('entity:paired', entityInfo);
        } else {
          // 这是服务器配对
          const serverInfo = {
            userId: this.userId,
            id: body.id || `server_${Date.now()}`,
            name: body.name || data.title || '未命名服务器',
            ip: body.ip,
            port: body.port,
            playerId: body.playerId,
            playerToken: body.playerToken,
            img: body.img,
            logo: body.logo,
            url: body.url,
            desc: body.desc,
            mapUrl: body.rust_world_levelurl || body.levelurl,
            type: 'pairing'
          };

          logger.info(`🎮 用户 ${this.userId} 收到服务器配对信息: ${serverInfo.name}`);
          this.emit('server:paired', serverInfo);
        }
      }

      // 备用：如果 channelId 是 'entity_pairing'（某些版本可能使用）
      else if (data.channelId === 'entity_pairing') {
        logger.info(`📋 设备配对 body 数据 (entity_pairing):`, JSON.stringify(body, null, 2));

        const entityInfo = {
          userId: this.userId,
          entityId: body.entityId,
          entityType: body.entityType,
          entityName: body.entityName || body.name,
          // serverId 可能在不同字段中
          serverId: body.id || body.serverId || body.server_id,
          type: 'entity'
        };

        logger.info(`🔌 用户 ${this.userId} 收到设备配对信息:`, entityInfo);
        this.emit('entity:paired', entityInfo);
      }

      // 玩家登录推送
      else if (data.channelId === 'login') {
        const loginInfo = {
          userId: this.userId,
          title: data.title,
          serverName: data.body || body.name,
          playerId: body.playerId,
          type: 'login'
        };

        logger.info(`👤 用户 ${this.userId} 收到玩家登录通知:`, loginInfo);
        this.emit('player:login', loginInfo);
      }

      // 玩家死亡推送
      else if (data.channelId === 'death') {
        const deathInfo = {
          userId: this.userId,
          title: data.title,
          details: data.body,
          type: 'death'
        };

        logger.info(`💀 用户 ${this.userId} 收到玩家死亡通知:`, deathInfo);
        this.emit('player:death', deathInfo);
      }

      // 智能警报推送
      else if (data.channelId === 'alarm') {
        const alarmInfo = {
          userId: this.userId,
          title: data.title,
          message: body.message || data.message || data.body,
          serverId: body.id,
          type: 'alarm'
        };

        logger.info(`🚨 用户 ${this.userId} 收到智能警报:`, alarmInfo);
        this.emit('alarm', alarmInfo);
      }

      // 其他推送
      else {
        logger.info(`📬 用户 ${this.userId} 收到其他推送:`, data.channelId);
        this.emit('notification', {
          userId: this.userId,
          channelId: data.channelId,
          title: data.title,
          message: data.message,
          body: body,
          type: 'other'
        });
      }
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} 处理 FCM 消息失败:`, error.message);
    }
  }

  /**
   * 处理 FCM 错误
   */
  handleFCMError(error) {
    logger.error(`❌ 用户 ${this.userId} FCM 错误:`, error.message);
    this.lastError = {
      message: error.message,
      timestamp: Date.now()
    };
    this.emit('error', { userId: this.userId, error });
  }

  /**
   * 获取当前凭证
   */
  getCredentials() {
    return this.credentials;
  }

  /**
   * 清除内存中的凭证
   */
  clearCredentials() {
    this.credentials = null;
    logger.info(`🗑️  用户 ${this.userId} FCM 内存凭证已清除`);
  }

  /**
   * 加载凭证
   */
  loadCredentials(credentials) {
    this.credentials = credentials;
    logger.info(`✅ 用户 ${this.userId} FCM 凭证已加载`);
  }

  /**
   * 获取 Expo Push Token
   * 使用 FCM Token 换取 Expo Push Token
   */
  async getExpoPushToken(fcmToken) {
    const axios = (await import('axios')).default;
    const { v4: uuidv4 } = await import('uuid');

    try {
      logger.info(`📱 用户 ${this.userId} 正在获取 Expo Push Token...`);

      // 配置 axios 使用代理
      const axiosConfig = {
        timeout: 30000,
      };

      if (this.proxyAgent) {
        axiosConfig.httpsAgent = this.proxyAgent;
        axiosConfig.httpAgent = this.proxyAgent;
        logger.debug(`   用户 ${this.userId} 使用代理请求 Expo API`);
      }

      const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: uuidv4(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: fcmToken,
        projectId: "49451aca-a822-41e6-ad59-955718d0ff9c",
      }, axiosConfig);

      const expoPushToken = response.data.data.expoPushToken;
      logger.info(`✅ 用户 ${this.userId} Expo Push Token 获取成功`);
      return expoPushToken;
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} 获取 Expo Push Token 失败:`, error.message);
      throw error;
    }
  }

  /**
   * 注册到 Rust+ API
   */
  async registerWithRustPlusAPI(authToken, expoPushToken) {
    const axios = (await import('axios')).default;

    try {
      logger.info(`📡 用户 ${this.userId} 正在注册到 Rust+ API...`);

      // 配置 axios 使用代理
      const axiosConfig = {
        timeout: 30000,
      };

      if (this.proxyAgent) {
        axiosConfig.httpsAgent = this.proxyAgent;
        axiosConfig.httpAgent = this.proxyAgent;
        logger.debug(`   用户 ${this.userId} 使用代理请求 Rust+ API`);
      }

      await axios.post('https://companion-rust.facepunch.com:443/api/push/register', {
        AuthToken: authToken,
        DeviceId: `rustplus.js-${this.userId}`,
        PushKind: 3,
        PushToken: expoPushToken,
      }, axiosConfig);

      logger.info(`✅ 用户 ${this.userId} Rust+ API 注册成功`);
      return true;
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} Rust+ API 注册失败:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 手动设置凭证（用于 Web 界面输入）
   * 支持从 Companion API 获取的 GCM 凭证格式
   */
  async setManualCredentials(credentialsData) {
    try {
      logger.info(`📝 用户 ${this.userId} 设置手动凭证...`);

      // 支持多种格式的凭证输入
      if (credentialsData.fcm && credentialsData.keys) {
        // 标准 rustplus.js 格式（已包含完整凭证）
        this.credentials = credentialsData;
        logger.info(`✅ 用户 ${this.userId} 标准 FCM 凭证格式识别成功`);
        return true;
      }

      if (credentialsData.gcm_android_id && credentialsData.gcm_security_token && credentialsData.steam_id) {
        // Companion API 格式
        this.credentials = {
          gcm: {
            androidId: credentialsData.gcm_android_id,
            securityToken: credentialsData.gcm_security_token,
          },
          steam: {
            steamId: credentialsData.steam_id,
          },
          issuedDate: credentialsData.issued_date || null,
          expireDate: credentialsData.expire_date || null,
        };

        logger.info(`✅ 用户 ${this.userId} GCM 凭证格式识别成功`);
        logger.debug(`   Android ID: ${credentialsData.gcm_android_id}`);
        logger.debug(`   Steam ID: ${credentialsData.steam_id}`);

        // 检查是否提供了 fcm_token 和 auth_token 以完成完整注册
        if (credentialsData.fcm_token && credentialsData.auth_token) {
          logger.info(`🔄 用户 ${this.userId} 检测到 FCM Token 和 Auth Token，开始完整注册流程...`);

          try {
            // 1. 获取 Expo Push Token
            const expoPushToken = await this.getExpoPushToken(credentialsData.fcm_token);

            // 2. 注册到 Rust+ API
            await this.registerWithRustPlusAPI(credentialsData.auth_token, expoPushToken);

            // 3. 保存完整信息
            this.credentials.fcm = { token: credentialsData.fcm_token };
            this.credentials.expo = { pushToken: expoPushToken };
            this.credentials.rustplus = { authToken: credentialsData.auth_token };

            logger.info(`✅ 用户 ${this.userId} 完整注册流程已完成！`);
          } catch (error) {
            logger.error(`❌ 用户 ${this.userId} 完整注册流程失败:`, error.message);
            logger.warn(`   将仅使用 GCM 凭证，可能无法接收推送`);
          }
        }

        return true;
      }

      throw new Error('无效的凭证格式。需要: gcm_android_id, gcm_security_token, steam_id');
    } catch (error) {
      logger.error(`❌ 用户 ${this.userId} 设置手动凭证失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取监听状态
   */
  getStatus() {
    let token = null;
    if (this.credentials?.fcm?.token) {
      token = this.credentials.fcm.token.substring(0, 50) + '...';
    } else if (this.credentials?.gcm?.androidId) {
      token = `GCM:${this.credentials.gcm.androidId}`;
    }

    return {
      userId: this.userId,
      isListening: this.isListening,
      hasCredentials: !!this.credentials,
      credentialType: this.credentials?.gcm ? 'GCM' : (this.credentials?.fcm ? 'FCM' : null),
      steamId: this.credentials?.steam?.steamId || null,
      token: token,
      lastError: this.lastError
    };
  }
}

export default UserFCMManager;
