import EventEmitter from 'events';
import RustPlus from '@liamcottle/rustplus.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import tls from 'tls';
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';
import { SocksClient } from 'socks';
import logger from '../utils/logger.js';
import https from 'https';
import http from 'http';

// Rust Companion App 公开参数（来自官方 CLI）
const FCM_CONFIG = {
  apiKey: "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY",
  projectId: "rust-companion-app",
  gcmSenderId: "976529667804",
  gmsAppId: "1:976529667804:android:d6f1ddeb4403b338fea619",
  androidPackageName: "com.facepunch.rust.companion",
  androidPackageCert: "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD"
};

class FCMService extends EventEmitter {
  constructor() {
    super();
    this.fcmListener = null;
    this.credentials = null;
    this.isListening = false;
    this.reconnectTimer = null;
    this.lastDisconnectTime = null;
    this.proxyAgent = null; // 代理 Agent (用于 HTTP 请求)
    this.proxyConfig = null; // SOCKS5 代理配置 (用于 FCM 连接)
  }

  /**
   * 设置代理 Agent（从 ProxyService 获取）
   */
  setProxyAgent(proxyAgent) {
    this.proxyAgent = proxyAgent;
    logger.info('✅ FCM 服务已配置 HTTP 代理');
  }

  /**
   * 设置 SOCKS5 代理配置（用于 FCM 连接）
   * @param {Object} config - { host: '127.0.0.1', port: 10808 }
   */
  setProxyConfig(config) {
    this.proxyConfig = config;
    logger.info(`✅ FCM 服务已配置 SOCKS5 代理: ${config.host}:${config.port}`);
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
      console.log('🔐 开始 FCM 注册...');

      console.log('📱 正在注册 FCM 设备...');
      const fcmCredentials = await AndroidFCM.register(
        FCM_CONFIG.apiKey,
        FCM_CONFIG.projectId,
        FCM_CONFIG.gcmSenderId,
        FCM_CONFIG.gmsAppId,
        FCM_CONFIG.androidPackageName,
        FCM_CONFIG.androidPackageCert
      );

      console.log('✅ FCM 设备注册成功');
      console.log('   Android ID:', fcmCredentials.gcm.androidId);
      console.log('   FCM Token:', fcmCredentials.fcm.token.substring(0, 50) + '...');

      // 获取 Expo Push Token
      console.log('📱 正在获取 Expo Push Token...');
      const expoPushToken = await this.getExpoPushToken(fcmCredentials.fcm.token);

      console.log('✅ Expo Push Token 获取成功');
      console.log('   Token:', expoPushToken.substring(0, 50) + '...');

      return {
        fcmCredentials,
        expoPushToken,
      };
    } catch (error) {
      console.error('❌ FCM 注册失败:', error);
      throw error;
    }
  }

  /**
   * 完成注册流程（使用 Auth Token）
   * 用户在 Steam 登录后获取 auth_token，调用此方法完成注册
   */
  async completeRegistration(fcmCredentials, expoPushToken, authToken) {
    try {
      console.log('🔐 完成 Rust+ API 注册...');

      // 注册到 Rust+ API
      await this.registerWithRustPlusAPI(authToken, expoPushToken);

      // 保存完整凭证
      this.credentials = {
        ...fcmCredentials,
        expo: { pushToken: expoPushToken },
        rustplus: { authToken: authToken },
      };

      console.log('✅ 完整注册流程已完成');
      return this.credentials;
    } catch (error) {
      console.error('❌ 完成注册失败:', error);
      throw error;
    }
  }

  /**
   * 使用已有凭证开始监听
   */
  async startListening() {
    if (this.isListening) {
      console.log('⚠️  FCM 监听器已在运行');
      return;
    }

    if (!this.credentials) {
      throw new Error('未找到 FCM 凭证，请先调用 registerAndListen()');
    }

    if (!this.credentials.gcm) {
      throw new Error('凭证格式错误：需要 GCM 格式的凭证 (gcm.androidId, gcm.securityToken)');
    }

    // 重置手动停止标志
    this._manualStop = false;

    console.log('👂 开始监听 FCM 推送消息...');
    console.log('📋 凭证信息:');
    const maskStr = (str) => str ? `${String(str).substring(0, 6)}****` : 'N/A';
    console.log('   - Android ID:', maskStr(this.credentials.gcm.androidId));
    console.log('   - Security Token:', maskStr(this.credentials.gcm.securityToken));

    // 创建 PushReceiverClient 监听器
    // 注意：androidId 和 securityToken 必须是字符串
    const androidId = String(this.credentials.gcm.androidId);
    const securityToken = String(this.credentials.gcm.securityToken);

    this.fcmListener = new PushReceiverClient(androidId, securityToken, []);

    // 监听数据接收事件（未加密的推送消息）
    this.fcmListener.on('ON_DATA_RECEIVED', (data) => {
      console.log('📩 收到未加密推送 (ON_DATA_RECEIVED)');
      this.handleFCMMessage(data);
    });

    // 监听通知接收事件（加密后解密的推送消息）
    this.fcmListener.on('ON_NOTIFICATION_RECEIVED', (data) => {
      console.log('📩 收到加密推送 (ON_NOTIFICATION_RECEIVED)');
      this.handleFCMMessage(data.notification || data);
    });

    // 添加连接成功事件监听（正确的事件名是 'connect'）
    this.fcmListener.on('connect', () => {
      console.log('🔗 FCM 连接已建立');
      console.log('📡 开始接收推送通知...');
    });

    // 添加断开连接事件监听（正确的事件名是 'disconnect'）
    this.fcmListener.on('disconnect', () => {
      const now = Date.now();

      // 如果是手动停止，不输出日志也不重连
      if (this._manualStop) {
        logger.debug('FCM disconnect 事件触发（手动停止，忽略）');
        return;
      }

      // 防止重复日志（1分钟内只输出一次）
      if (!this.lastDisconnectTime || (now - this.lastDisconnectTime) > 60000) {
        console.log('⚠️  FCM 连接已断开');
        console.log('💡 提示：FCM 断开不影响游戏内事件（死亡、聊天等）');
        console.log('   → 游戏内事件通过 Rust+ WebSocket 接收');
        console.log('   → FCM 仅用于接收配对推送（在游戏中点击 Pair）');
        console.log('   → 将每 5 分钟尝试重连一次');
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
            console.log('🔄 尝试重新连接 FCM...');
            await this.startListening();
          } catch (error) {
            console.error('❌ FCM 重连失败:', error.message);
          }
        }
      }, 300000); // 5 分钟 = 300000 毫秒
    });

    // 监听错误
    this.fcmListener.on('error', (error) => {
      console.log('❌ 触发 error 事件');
      this.handleFCMError(error);
    });

    // 连接到 FCM - 如果配置了代理则通过代理连接
    try {
      console.log('🔌 正在连接到 FCM 服务器...');

      // 如果配置了 SOCKS5 代理，使用代理连接
      if (this.proxyConfig) {
        console.log(`🌐 通过代理连接: ${this.proxyConfig.host}:${this.proxyConfig.port}`);
        await this._connectWithProxy();
      } else {
        await this.fcmListener.connect();
      }

      this.isListening = true;
      console.log('✅ FCM 连接流程已启动');
      console.log('📡 等待 connect 事件确认连接...');

      this.emit('listening');
    } catch (error) {
      console.error('❌ FCM 连接失败:', error);
      this.handleFCMError(error);
      throw error;
    }
  }

  /**
   * 通过 SOCKS5 代理连接到 FCM
   *
   * 问题：PushReceiverClient 的 connect() 会调用 checkIn()，
   * checkIn 使用 HTTP 请求访问 android.clients.google.com，无法走代理。
   *
   * 解决方案：手动建立代理连接 + TLS 升级，跳过 checkIn
   */
  async _connectWithProxy() {
    const FCM_HOST = 'mtalk.google.com';
    const FCM_PORT = 5228;

    logger.info(`🌐 通过 SOCKS5 代理 ${this.proxyConfig.host}:${this.proxyConfig.port} 连接到 FCM...`);

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

    logger.info('✅ SOCKS5 代理 TCP 连接已建立');

    const proxySocket = proxyResult.socket;

    // 2. 初始化 protobuf
    await this.fcmListener.constructor.init();

    // 3. 在代理 socket 上进行 TLS 升级
    logger.info('🔒 升级为 TLS 连接...');

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
        logger.info('✅ TLS 握手完成');

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
            logger.debug('🚫 库内部重连已被禁用');
          };

          logger.info('✅ FCM 代理连接完成');
          this.fcmListener.emit('connect');
          done();
          resolve();
        } catch (err) {
          done(err);
        }
      });

      // 错误处理
      tlsSocket.once('error', (err) => {
        logger.error('❌ TLS 错误:', err.message);
        done(err);
      });

      proxySocket.once('error', (err) => {
        logger.error('❌ 代理 Socket 错误:', err.message);
        done(err);
      });

      proxySocket.once('close', (hadError) => {
        if (!resolved) {
          logger.error('❌ 代理连接被关闭, hadError:', hadError);
          done(new Error('代理连接被关闭'));
        }
      });
    });
  }

  /**
   * 停止监听
   * @param {boolean} preventReconnect - 是否阻止自动重连（默认 true）
   */
  stopListening(preventReconnect = true) {
    // 设置标志阻止 disconnect 事件触发重连
    if (preventReconnect) {
      this._manualStop = true;
    }

    // 恢复原始的 tls.connect（如果被修改了）
    if (this._originalTlsConnect) {
      tls.connect = this._originalTlsConnect;
      logger.debug('✅ tls.connect 已恢复');
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

      console.log('🛑 FCM 监听已停止');
      this.emit('stopped');
    }
  }

  /**
   * 处理接收到的 FCM 推送消息
   */
  handleFCMMessage(message) {
    console.log('\n========================================');
    console.log('📨 收到 FCM 推送消息！');
    console.log('========================================');
    console.log('原始消息类型:', typeof message);
    console.log('原始消息键:', Object.keys(message || {}));
    console.log('原始消息内容:');
    console.log(JSON.stringify(message, null, 2));
    console.log('========================================\n');

    try {
      // PushReceiverClient 的消息格式可能是 { notification: {...} } 或 直接的 data
      let data = message;

      // 检查是否有 notification 包装
      if (message.notification) {
        console.log('📦 检测到 notification 包装');
        data = message.notification.data || message.notification;
      }

      // 检查是否有 data 字段
      if (message.data) {
        console.log('📦 检测到 data 字段');
        data = message.data;
      }

      if (!data) {
        console.warn('⚠️  收到空消息');
        return;
      }

      // 如果是 appData 数组格式，转换为对象
      if (data.appData && Array.isArray(data.appData)) {
        console.log('📦 检测到 appData 数组格式，正在转换...');
        const convertedData = {};
        for (const item of data.appData) {
          if (item.key && item.value !== undefined) {
            convertedData[item.key] = item.value;
          }
        }
        console.log('✅ 转换后的数据:', JSON.stringify(convertedData, null, 2));
        data = { ...data, ...convertedData };
      }

      // console.log('📨 处理后的数据:', JSON.stringify(data, null, 2));

      // 解析消息数据 - body 可能是字符串或对象
      let body = {};
      if (data.body) {
        try {
          body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
          console.log('📋 解析后的 body:', JSON.stringify(body, null, 2));
        } catch (e) {
          console.warn('⚠️  无法解析消息 body:', data.body);
        }
      }

      // 配对推送 - 包含服务器连接信息
      if (data.channelId === 'pairing') {
        const serverInfo = {
          id: body.id || `server_${Date.now()}`,
          name: body.name || data.title || '未命名服务器',
          ip: body.ip,
          port: body.port,
          playerId: body.playerId,
          playerToken: body.playerToken,
          img: body.img, // 服务器图标
          logo: body.logo, // 服务器 logo
          url: body.url, // 服务器网站 URL
          desc: body.desc, // 服务器描述
          mapUrl: body.rust_world_levelurl || body.levelurl, // 地图文件 URL
          type: 'pairing'
        };

        console.log('🎮 收到服务器配对信息:', serverInfo.name);
        this.emit('server:paired', serverInfo);
      }

      // 实体配对 - 智能设备配对
      else if (data.channelId === 'entity_pairing') {
        const entityInfo = {
          entityId: body.entityId,
          entityType: body.entityType,
          entityName: body.entityName,
          serverId: body.id,
          type: 'entity'
        };

        console.log('🔌 收到设备配对信息:', entityInfo);
        this.emit('entity:paired', entityInfo);
      }

      // 玩家登录推送 (Channel: 1002)
      else if (data.channelId === 'login') {
        const loginInfo = {
          title: data.title,           // "Player Name is online"
          serverName: data.body || body.name,
          playerId: body.playerId,
          type: 'login'
        };

        console.log('👤 收到玩家登录通知:', loginInfo);
        this.emit('player:login', loginInfo);
      }

      // 玩家死亡推送 (Channel: 1003)
      else if (data.channelId === 'death') {
        const deathInfo = {
          title: data.title,           // "You were killed by..."
          details: data.body,
          type: 'death'
        };

        console.log('💀 收到玩家死亡通知:', deathInfo);
        this.emit('player:death', deathInfo);
      }

      // 智能警报推送 (Channel: 1004)
      else if (data.channelId === 'alarm') {
        const alarmInfo = {
          title: data.title,
          message: body.message || data.message || data.body,
          serverId: body.id,
          type: 'alarm'
        };

        console.log('🚨 收到智能警报:', alarmInfo);
        this.emit('alarm', alarmInfo);
      }

      // 其他推送
      else {
        console.log('📬 收到其他推送:', data.channelId);
        this.emit('notification', {
          channelId: data.channelId,
          title: data.title,
          message: data.message,
          body: body,
          type: 'other'
        });
      }
    } catch (error) {
      console.error('❌ 处理 FCM 消息失败:', error);
    }
  }

  /**
   * 处理 FCM 错误
   */
  handleFCMError(error) {
    console.error('❌ FCM 错误:', error);
    this.emit('error', error);
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
    console.log('🗑️  FCM 内存凭证已清除');
  }

  /**
   * 从本地加载凭证
   */
  loadCredentials(credentials) {
    this.credentials = credentials;
    console.log('✅ FCM 凭证已加载');
  }

  /**
   * 从 rustplus CLI 加载凭证
   * 凭证位置: ~/.rustplus/credentials
   */
  async loadFromRustPlusCLI() {
    try {
      const credPath = path.join(os.homedir(), '.rustplus', 'credentials');

      if (!fs.existsSync(credPath)) {
        console.log('⚠️  未找到 rustplus CLI 凭证文件');
        console.log('📍 期望位置:', credPath);
        console.log('💡 提示: 先运行 "rustplus-pairing-server" 获取凭证');
        console.log('💡 或者: 通过 Web 界面手动输入凭证');
        return false;
      }

      const fileContent = fs.readFileSync(credPath, 'utf8');
      const creds = JSON.parse(fileContent);

      this.credentials = creds;
      console.log('✅ 已从 rustplus CLI 加载凭证');
      console.log('📂 凭证来源:', credPath);

      return true;
    } catch (error) {
      console.error('❌ 读取 rustplus CLI 凭证失败:', error.message);
      return false;
    }
  }

  /**
   * 获取 Expo Push Token
   * 使用 FCM Token 换取 Expo Push Token
   */
  async getExpoPushToken(fcmToken) {
    const axios = (await import('axios')).default;
    const { v4: uuidv4 } = await import('uuid');

    try {
      console.log('📱 正在获取 Expo Push Token...');

      // 配置 axios 使用代理
      const axiosConfig = {
        timeout: 30000,
      };

      if (this.proxyAgent) {
        axiosConfig.httpsAgent = this.proxyAgent;
        axiosConfig.httpAgent = this.proxyAgent;
        logger.debug('   使用代理请求 Expo API');
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
      console.log('✅ Expo Push Token 获取成功');
      return expoPushToken;
    } catch (error) {
      console.error('❌ 获取 Expo Push Token 失败:', error.message);
      throw error;
    }
  }

  /**
   * 注册到 Rust+ API
   */
  async registerWithRustPlusAPI(authToken, expoPushToken) {
    const axios = (await import('axios')).default;

    try {
      console.log('📡 正在注册到 Rust+ API...');

      // 配置 axios 使用代理
      const axiosConfig = {
        timeout: 30000,
      };

      if (this.proxyAgent) {
        axiosConfig.httpsAgent = this.proxyAgent;
        axiosConfig.httpAgent = this.proxyAgent;
        logger.debug('   使用代理请求 Rust+ API');
      }

      await axios.post('https://companion-rust.facepunch.com:443/api/push/register', {
        AuthToken: authToken,
        DeviceId: 'rustplus.js-web',
        PushKind: 3,
        PushToken: expoPushToken,
      }, axiosConfig);

      console.log('✅ Rust+ API 注册成功');
      return true;
    } catch (error) {
      console.error('❌ Rust+ API 注册失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 手动设置凭证（用于 Web 界面输入）
   * 支持从 Companion API 获取的 GCM 凭证格式
   *
   * 现在支持完整的注册流程：
   * 1. 如果提供了 fcm_token 和 auth_token，会自动完成 Expo 和 API 注册
   * 2. 如果只提供 GCM 凭证，仅保存凭证（可能无法接收推送）
   */
  async setManualCredentials(credentialsData) {
    try {
      console.log('📝 设置手动凭证...');

      // 支持多种格式的凭证输入
      if (credentialsData.fcm && credentialsData.keys) {
        // 标准 rustplus.js 格式（已包含完整凭证）
        this.credentials = credentialsData;
        console.log('✅ 标准 FCM 凭证格式识别成功');
        return true;
      }

      if (credentialsData.gcm_android_id && credentialsData.gcm_security_token && credentialsData.steam_id) {
        // Companion API 格式 (从 https://companion-rust.facepunch.com/login 获取)
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

        console.log('✅ GCM 凭证格式识别成功');
        console.log('   Android ID:', credentialsData.gcm_android_id);
        console.log('   Steam ID:', credentialsData.steam_id);
        if (credentialsData.expire_date) {
          const expireTime = new Date(parseInt(credentialsData.expire_date) * 1000);
          console.log('   过期时间:', expireTime.toLocaleString());
        }

        // 检查是否提供了 fcm_token 和 auth_token 以完成完整注册
        if (credentialsData.fcm_token && credentialsData.auth_token) {
          console.log('');
          console.log('🔄 检测到 FCM Token 和 Auth Token，开始完整注册流程...');

          try {
            // 1. 获取 Expo Push Token
            const expoPushToken = await this.getExpoPushToken(credentialsData.fcm_token);

            // 2. 注册到 Rust+ API
            await this.registerWithRustPlusAPI(credentialsData.auth_token, expoPushToken);

            // 3. 保存完整信息
            this.credentials.fcm = { token: credentialsData.fcm_token };
            this.credentials.expo = { pushToken: expoPushToken };
            this.credentials.rustplus = { authToken: credentialsData.auth_token };

            console.log('');
            console.log('✅ 完整注册流程已完成！');
            console.log('   - Expo Push Token: ' + expoPushToken.substring(0, 20) + '...');
            console.log('   - 已注册到 Rust+ API');
            console.log('');
          } catch (error) {
            console.error('');
            console.error('❌ 完整注册流程失败:', error.message);
            console.error('   将仅使用 GCM 凭证，可能无法接收推送');
            console.error('');
          }
        } else {
          console.log('');
          console.log('⚠️  警告：仅提供了 GCM 凭证');
          console.log('   companion-rust.facepunch.com 返回的凭证缺少：');
          console.log('   - fcm_token (FCM 设备令牌)');
          console.log('   - auth_token (Rust+ 认证令牌)');
          console.log('');
          console.log('   这意味着无法完成 Expo 和 Rust+ API 注册。');
          console.log('   推送通知可能无法接收。');
          console.log('');
          console.log('   建议使用官方 CLI 完整注册：');
          console.log('   npx @liamcottle/rustplus.js fcm-register');
          console.log('');
        }

        return true;
      }

      throw new Error('无效的凭证格式。需要: gcm_android_id, gcm_security_token, steam_id');
    } catch (error) {
      console.error('❌ 设置手动凭证失败:', error);
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
      isListening: this.isListening,
      hasCredentials: !!this.credentials,
      credentialType: this.credentials?.gcm ? 'GCM' : (this.credentials?.fcm ? 'FCM' : null),
      steamId: this.credentials?.steam?.steamId || null,
      token: token
    };
  }
}

export default new FCMService();
