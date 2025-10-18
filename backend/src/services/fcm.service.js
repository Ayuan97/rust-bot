import EventEmitter from 'events';
import RustPlus from '@liamcottle/rustplus.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';

class FCMService extends EventEmitter {
  constructor() {
    super();
    this.fcmListener = null;
    this.credentials = null;
    this.isListening = false;
  }

  /**
   * 注册 FCM 并开始监听
   * @param {Object} steamCredentials - Steam 凭证 (可选)
   */
  async registerAndListen(steamCredentials = null) {
    try {
      console.log('🔐 正在注册 FCM...');

      // 使用 Rust+ Companion 的 FCM 配置
      const apiKey = "AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY";
      const projectId = "rust-companion-app";
      const gcmSenderId = "976529667804";
      const gmsAppId = "1:976529667804:android:d6f1ddeb4403b338fea619";
      const androidPackageName = "com.facepunch.rust.companion";
      const androidPackageCert = "E28D05345FB78A7A1A63D70F4A302DBF426CA5AD";

      // 注册 FCM 获取凭证
      const fcmCredentials = await AndroidFCM.register(
        apiKey,
        projectId,
        gcmSenderId,
        gmsAppId,
        androidPackageName,
        androidPackageCert
      );

      // 保存为 GCM 格式（与 rustplus CLI 一致）
      this.credentials = fcmCredentials;

      console.log('✅ FCM 注册成功！');
      console.log('📱 Android ID:', fcmCredentials.gcm.androidId);

      // 开始监听配对推送
      this.startListening();

      return this.credentials;
    } catch (error) {
      console.error('❌ FCM 注册失败:', error);
      throw error;
    }
  }

  /**
   * 使用已有凭证开始监听
   */
  startListening() {
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

    console.log('👂 开始监听 FCM 推送消息...');
    console.log('📋 Android ID:', this.credentials.gcm.androidId);

    // 创建 PushReceiverClient 监听器
    const androidId = this.credentials.gcm.androidId;
    const securityToken = this.credentials.gcm.securityToken;

    this.fcmListener = new PushReceiverClient(androidId, securityToken, []);

    // 监听接收到的数据
    this.fcmListener.on('ON_DATA_RECEIVED', (data) => {
      this.handleFCMMessage(data);
    });

    // 监听错误
    this.fcmListener.on('error', (error) => {
      this.handleFCMError(error);
    });

    // 连接到 FCM
    this.fcmListener.connect().then(() => {
      this.isListening = true;
      console.log('✅ FCM 监听已启动');
      this.emit('listening');
    }).catch((error) => {
      console.error('❌ FCM 连接失败:', error);
      this.handleFCMError(error);
    });
  }

  /**
   * 停止监听
   */
  stopListening() {
    if (this.fcmListener) {
      this.fcmListener.destroy();
      this.fcmListener = null;
      this.isListening = false;
      console.log('🛑 FCM 监听已停止');
      this.emit('stopped');
    }
  }

  /**
   * 处理接收到的 FCM 推送消息
   */
  handleFCMMessage(message) {
    console.log('📨 收到 FCM 推送:', JSON.stringify(message, null, 2));

    try {
      // PushReceiverClient 直接返回 data 对象
      const data = message;

      if (!data) {
        console.warn('⚠️  收到空消息');
        return;
      }

      // 解析消息数据 - body 可能是字符串或对象
      let body = {};
      if (data.body) {
        try {
          body = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
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
          url: body.url, // 地图 URL
          desc: body.desc, // 服务器描述
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
   * 手动设置凭证（用于 Web 界面输入）
   * 支持从 Companion API 获取的 GCM 凭证格式
   */
  setManualCredentials(credentialsData) {
    try {
      console.log('📝 设置手动凭证...', credentialsData);

      // 支持多种格式的凭证输入
      if (credentialsData.fcm && credentialsData.keys) {
        // 标准 rustplus.js 格式
        this.credentials = credentialsData;
      } else if (credentialsData.gcm_android_id && credentialsData.gcm_security_token && credentialsData.steam_id) {
        // Companion API 格式 (从 https://companion-rust.facepunch.com/login 获取)
        // 格式: gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx
        this.credentials = {
          gcm: {
            androidId: credentialsData.gcm_android_id,
            securityToken: credentialsData.gcm_security_token,
          },
          steam: {
            steamId: credentialsData.steam_id,
          },
          // 可选的时间戳
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
      } else {
        throw new Error('无效的凭证格式。需要: gcm_android_id, gcm_security_token, steam_id');
      }

      console.log('✅ 手动凭证已设置');
      return true;
    } catch (error) {
      console.error('❌ 设置手动凭证失败:', error);
      throw error;
    }
  }

  /**
   * 获取监听状态
   */
  getStatus() {
    return {
      isListening: this.isListening,
      hasCredentials: !!this.credentials,
      credentialType: this.credentials?.gcm ? 'GCM' : (this.credentials?.fcm ? 'FCM' : null),
      steamId: this.credentials?.steam?.steamId || null,
      token: this.credentials?.fcm?.token?.substring(0, 50) + '...' ||
             (this.credentials?.gcm ? `GCM:${this.credentials.gcm.androidId}` : null)
    };
  }
}

export default new FCMService();
