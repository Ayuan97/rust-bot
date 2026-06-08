/**
 * UserRustPlusManager - 用户级别的 Rust+ 连接管理器
 * 每个用户一个实例，管理该用户的所有 Rust+ 服务器连接
 */

import RustPlusClient from '../lib/rustplus-client.js';
import EventEmitter from 'events';
import logger from '../utils/logger.js';

class UserRustPlusManager extends EventEmitter {
  constructor(userId, options = {}) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    this.userId = userId;
    // 分布式 connector 模式应禁用本地自动重连：重连由控制平面 assignment 主导，避免与 failover 冲突造成双连接
    this.autoReconnect = options.autoReconnect !== false;
    this.connections = new Map(); // serverId -> rustplus instance
    this.connecting = new Set(); // 正在连接中的 serverId（防止竞态）
    this.serverConfigs = new Map(); // serverId -> config（保存配置用于重连）
    this.reconnectAttempts = new Map(); // serverId -> 当前重连尝试次数
    this.reconnectTimers = new Map(); // serverId -> 重连定时器
    this.manualDisconnect = new Set(); // 手动断开的服务器（不自动重连）
    this.cameras = new Map(); // `${serverId}:${cameraId}` -> Camera instance
    this.mapCache = new Map(); // serverId -> { width, height, lastUpdate }

    // 代理出口运行时状态：默认取自环境(向后兼容)；分布式下由连接器从控制平面动态下发后用 setProxy 更新
    this.proxy = {
      enabled: process.env.PROXY_ENABLED === '1',
      socks: process.env.PROXY_SOCKS || ''
    };

    // 重连配置
    this.RECONNECT_INITIAL_DELAYS = [5000, 10000, 20000, 40000, 60000]; // 前5次递增延迟
    this.RECONNECT_INTERVAL = 60000; // 之后每60秒重试一次（无限重试）

    // 聊天消息队列配置（参考 rustplusplus）
    this.chatQueues = new Map(); // serverId -> { queue: [], processing: false, timeout: null }
    this.messagesSentByBot = new Map(); // serverId -> [messages] 用于 bot 消息去重
    this.CHAT_MAX_LENGTH = 128; // Rust+ 消息最大长度
    this.CHAT_SEND_DELAY = 2500; // 消息发送间隔（毫秒）
    this.BOT_MESSAGE_HISTORY_LIMIT = 20; // bot 消息历史记录数量

    logger.debug(`👤 UserRustPlusManager 已创建 (userId: ${userId})`);
  }

  /**
   * 设置/更新代理出口（连接器从控制平面拉到代理配置后调用，运行时生效，无需重启）
   */
  setProxy({ enabled, socks } = {}) {
    if (typeof enabled === 'boolean') this.proxy.enabled = enabled;
    if (typeof socks === 'string') this.proxy.socks = socks;
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

    // 过滤掉 FCM 占位符或无效 IP (0.0.0.0)
    if (ip === '0.0.0.0' || (serverId && String(serverId).startsWith('fcm-'))) {
      logger.debug(`⏩ 用户 ${this.userId} 跳过连接无效服务器: ${serverId} (${ip})`);
      return null;
    }

    // 已连接，直接返回
    if (this.connections.has(serverId)) {
      logger.debug(`用户 ${this.userId} 的服务器 ${serverId} 已连接`);
      return this.connections.get(serverId);
    }

    // 竞态保护：正在连接中，抛出错误
    if (this.connecting.has(serverId)) {
      throw new Error(`服务器 ${serverId} 正在连接中，请稍候`);
    }

    // 标记为正在连接，清除手动断开标记
    this.connecting.add(serverId);
    this.manualDisconnect.delete(serverId);

    // 保存配置用于重连
    this.serverConfigs.set(serverId, config);

    // 出口策略：直连优先；开启代理时，直连失败后回退到 SOCKS 代理出口
    const egresses = (this.proxy.enabled && this.proxy.socks) ? [null, this.proxy.socks] : [null];

    // 为单个 RustPlusClient 绑定全部事件监听（每次连接尝试各自一份）
    const attachHandlers = (rustplus) => {
      // 监听连接事件
      rustplus.on('connected', async () => {
        // 【连接验证】参考 rustplusplus：连接后立即验证，确保连接真正有效
        // 使用 getInfo 验证（比 getMap 更快，数据量小）
        const VALIDATION_TIMEOUT = 30000; // 30秒验证超时
        let isValid = false;
        let serverName = serverId;

        try {
          const info = await rustplus.sendRequestAsync({ getInfo: {} }, VALIDATION_TIMEOUT);

          // 验证响应是否有效
          if (info === undefined || info.error || Object.keys(info).length === 0) {
            // 验证失败，静默处理
          } else if (info.info) {
            isValid = true;
            serverName = info.info.name || serverId;
          }
        } catch (err) {
          // 验证失败，静默处理
        }

        // 验证失败，主动断开连接（会触发 disconnected 事件和自动重连）
        if (!isValid) {
          rustplus.disconnect();
          return;
        }

        // 验证通过，正式标记为已连接
        // 保存服务器名称到 logger（供其他服务使用）
        logger.setServerName(serverId, serverName);
        logger.server(serverId, `✅ 用户 ${this.userId} 已连接`);

        // 连接成功，重置重连计数
        this.reconnectAttempts.delete(serverId);
        this.emit('server:connected', { userId: this.userId, serverId, serverName });

        // 主动获取初始队伍状态
        try {
          await this.getTeamInfo(serverId);
        } catch (err) {
          // 静默处理
        }

        // 直接调用 getServerInfo 获取并保存 mapSize
        try {
          await this.getServerInfo(serverId);
        } catch (err) {
          // 静默处理
        }
      });

      rustplus.on('disconnected', () => {
        const wasConnected = this.connections.has(serverId);
        // 失败的连接尝试（从未建立成功，例如直连握手超时）不向上报断开，
        // 避免"直连失败→回退代理"过程中产生噪声 disconnected 事件。
        if (!wasConnected) return;
        logger.server(serverId, `❌ 用户 ${this.userId} 已断开`);
        this.connections.delete(serverId);
        this.emit('server:disconnected', { userId: this.userId, serverId });

        // 仅对已建立过的连接自动重连，避免无限重试风暴。
        // 分布式 connector 模式禁用本地重连（autoReconnect=false），由控制平面 assignment 决定是否重连。
        if (!this.manualDisconnect.has(serverId) && this.autoReconnect) {
          this.scheduleReconnect(serverId);
        }
      });

      rustplus.on('error', (error) => {
        logger.error(`❌ 用户 ${this.userId} 服务器错误 ${serverId}:`, error.message || error);
        this.emit('server:error', { userId: this.userId, serverId, error: error.message || String(error) });

        // 如果是 protobuf 错误，不要让整个应用崩溃
        if (error.message && error.message.includes('missing required')) {
          logger.warn('⚠️  检测到 protobuf 格式不兼容，可能是服务器协议版本问题');
          logger.warn('💡 建议: 更新 @liamcottle/rustplus.js 到最新版本');
        }
      });

      // 监听消息事件
      rustplus.on('message', (message) => {
        try {
          // 向内部事件总线转发原始消息，便于调试
          this.emit('rust:message', { userId: this.userId, serverId, raw: message });

          this.handleMessage(serverId, message);
        } catch (err) {
          logger.error(`用户 ${this.userId} 处理消息失败 ${serverId}:`, err.message);
        }
      });

    };

    try {
      let lastError;
      for (let i = 0; i < egresses.length; i++) {
        const eg = egresses[i];
        const rustplus = new RustPlusClient(ip, port, playerId, playerToken, eg);
        attachHandlers(rustplus);
        try {
          await rustplus.connect();
          this.connections.set(serverId, rustplus);
          if (eg) logger.server(serverId, `✅ 用户 ${this.userId} 已经代理出口连接`);
          return rustplus;
        } catch (err) {
          lastError = err;
          try { rustplus.disconnect(); } catch { /* ignore */ }
          if (eg) {
            logger.server(serverId, `代理出口连接失败: ${err.message || err}`);
          } else if (egresses.length > 1) {
            logger.server(serverId, `直连失败(${err.message || err})，回退代理出口…`);
          }
        }
      }
      throw lastError || new Error('连接失败');
    } catch (error) {
      logger.error(`用户 ${this.userId} 连接失败 ${serverId}:`, error.message || error);
      throw error;
    } finally {
      // 无论成功失败，都清理 connecting 状态
      this.connecting.delete(serverId);
    }
  }

  /**
   * 断开服务器连接
   */
  async disconnect(serverId) {
    // 标记为手动断开，阻止自动重连
    this.manualDisconnect.add(serverId);

    // 清除重连定时器
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
    this.reconnectAttempts.delete(serverId);

    const rustplus = this.connections.get(serverId);
    if (rustplus) {
      rustplus.disconnect();
      this.connections.delete(serverId);
      logger.debug(`用户 ${this.userId} 断开连接: ${serverId}`);
    }

    // 清理该服务器下的相机实例
    for (const key of Array.from(this.cameras.keys())) {
      if (key.startsWith(`${serverId}:`)) {
        const camera = this.cameras.get(key);
        try {
          camera?.removeAllListeners?.();
          await camera?.unsubscribe?.();
        } catch (e) {
          logger.debug(`相机取消订阅失败 (${key}): ${e.message}`);
        }
        this.cameras.delete(key);
      }
    }

    // 清理地图缓存
    this.mapCache.delete(serverId);

    // 清理聊天队列
    const chatQueue = this.chatQueues.get(serverId);
    if (chatQueue) {
      if (chatQueue.timeout) clearTimeout(chatQueue.timeout);
      this.chatQueues.delete(serverId);
    }
    this.messagesSentByBot.delete(serverId);
  }

  /**
   * 断开所有服务器连接
   */
  async disconnectAll() {
    const serverIds = Array.from(this.connections.keys());
    for (const serverId of serverIds) {
      try {
        await this.disconnect(serverId);
      } catch (error) {
        logger.error(`用户 ${this.userId} 断开服务器 ${serverId} 失败:`, error.message);
      }
    }
    logger.debug(`用户 ${this.userId} 所有服务器已断开 (${serverIds.length} 个)`);
  }

  /**
   * 调度自动重连（前5次递增延迟，之后每60秒无限重试）
   */
  scheduleReconnect(serverId) {
    const config = this.serverConfigs.get(serverId);
    if (!config) {
      logger.warn(`⚠️  用户 ${this.userId} 无法重连 ${serverId}：缺少配置信息`);
      return;
    }

    // 清除已有的重连定时器，防止重复调度
    const existingTimer = this.reconnectTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(serverId);
    }

    const attempts = (this.reconnectAttempts.get(serverId) || 0) + 1;
    this.reconnectAttempts.set(serverId, attempts);

    // 前5次使用递增延迟，之后固定60秒
    const delay = attempts <= this.RECONNECT_INITIAL_DELAYS.length
      ? this.RECONNECT_INITIAL_DELAYS[attempts - 1]
      : this.RECONNECT_INTERVAL;

    logger.server(serverId, `🔄 用户 ${this.userId} ${delay / 1000}s 后重连 (第 ${attempts} 次)`);
    this.emit('server:reconnecting', { userId: this.userId, serverId, attempts, delay });

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(serverId);

      // 再次检查是否被手动断开
      if (this.manualDisconnect.has(serverId)) {
        return;
      }

      // 检查是否已连接
      if (this.connections.has(serverId)) {
        return;
      }

      try {
        await this.connect(config);
      } catch (error) {
        // 失败后继续调度下一次重连
        this.scheduleReconnect(serverId);
      }
    }, delay);

    this.reconnectTimers.set(serverId, timer);
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
    // 存储原始地图大小，coordinates.js 会在使用时进行网格修正
    if (info && info.mapSize) {
      this.mapCache.set(serverId, {
        width: info.mapSize,
        height: info.mapSize,
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

    // 地图数据量大，使用更长的超时时间（60秒）
    const res = await rustplus.sendRequestAsync({ getMap: {} }, 60000);
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
    // 直接返回缓存的 mapSize，无复杂的过期/刷新逻辑
    const cached = this.mapCache.get(serverId);
    return cached?.width || 4500;
  }

  /**
   * 获取海洋边距（oceanMargin）
   */
  getMapOceanMargin(serverId) {
    return this.mapCache.get(serverId)?.oceanMargin || 0;
  }

  /**
   * 获取连接的 playerId（机器人自己的 Steam ID）
   */
  getPlayerId(serverId) {
    const rustplus = this.connections.get(serverId);
    return rustplus?.playerId || null;
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
      const infoRes = await rustplus.sendRequestAsync({ getInfo: {} }, 15000);
      if (infoRes?.info?.mapSize) {
        // 存储原始地图大小，coordinates.js 会在使用时进行网格修正
        mapSize = infoRes.info.mapSize;
      }
    } catch (e) {
      logger.warn(`⚠️ 用户 ${this.userId} 无法获取地图信息:`, e.message + '，将使用默认值', mapSize);
    }

    // 直接请求 AppMap 获取 oceanMargin（超时时间更长，因为数据量大）
    let oceanMargin = 0;
    try {
      const mapRes = await rustplus.sendRequestAsync({ getMap: {} }, 60000);
      if (typeof mapRes?.map?.oceanMargin === 'number') {
        oceanMargin = mapRes.map.oceanMargin;
      }
    } catch (e) {
      // 忽略错误，使用默认值
    }

    return { mapSize, oceanMargin };
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
   * 发送队伍聊天消息（支持长消息拆分和队列发送）
   * @param {string} serverId - 服务器 ID
   * @param {string} message - 消息内容
   * @param {Object} options - 选项
   * @param {boolean} options.isBot - 是否是 bot 发送的消息（用于去重）
   */
  async sendTeamMessage(serverId, message, options = {}) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const { isBot = false } = options;

    // 初始化队列
    if (!this.chatQueues.has(serverId)) {
      this.chatQueues.set(serverId, { queue: [], processing: false, timeout: null });
    }

    // 拆分长消息（参考 rustplusplus）
    const messages = this.splitMessage(message);

    // 将消息加入队列
    const chatQueue = this.chatQueues.get(serverId);
    for (const msg of messages) {
      chatQueue.queue.push({ message: msg, isBot });
    }

    // 启动队列处理
    this.processChatQueue(serverId);

    return { success: true, message, splitCount: messages.length };
  }

  /**
   * 拆分长消息为多条短消息
   * @param {string} message - 原始消息
   * @returns {string[]} 拆分后的消息数组
   */
  splitMessage(message) {
    if (!message) return [];

    const maxLength = this.CHAT_MAX_LENGTH;

    // 消息不需要拆分
    if (message.length <= maxLength) {
      return [message];
    }

    // 使用正则按词边界拆分，避免截断单词
    const regex = new RegExp(`.{1,${maxLength}}(\\s|$)`, 'g');
    const matches = message.match(regex);

    if (matches) {
      return matches.map(s => s.trim()).filter(s => s.length > 0);
    }

    // 如果没有空格（如中文），直接按长度拆分
    const result = [];
    for (let i = 0; i < message.length; i += maxLength) {
      result.push(message.slice(i, i + maxLength));
    }
    return result;
  }

  /**
   * 处理消息队列（带速率限制）
   * @param {string} serverId - 服务器 ID
   */
  async processChatQueue(serverId) {
    const chatQueue = this.chatQueues.get(serverId);
    if (!chatQueue || chatQueue.processing || chatQueue.queue.length === 0) {
      return;
    }

    chatQueue.processing = true;

    const rustplus = this.connections.get(serverId);
    if (!rustplus) {
      chatQueue.processing = false;
      chatQueue.queue = [];
      return;
    }

    // 取出队列中的第一条消息
    const { message, isBot } = chatQueue.queue.shift();

    try {
      await rustplus.sendRequestAsync({ sendTeamMessage: { message } });
      logger.debug(`📨 用户 ${this.userId} 发送消息 (${serverId}): ${message}`);

      // 如果是 bot 消息，记录用于去重
      if (isBot) {
        this.recordBotMessage(serverId, message);
      }
    } catch (error) {
      const errorMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      // logger.error(`❌ 用户 ${this.userId} 发送消息失败 (${serverId}):`, errorMsg);
    }

    chatQueue.processing = false;

    // 如果队列中还有消息，延迟后继续处理
    if (chatQueue.queue.length > 0) {
      chatQueue.timeout = setTimeout(() => {
        this.processChatQueue(serverId);
      }, this.CHAT_SEND_DELAY);
    }
  }

  /**
   * 记录 bot 发送的消息（用于去重）
   * @param {string} serverId - 服务器 ID
   * @param {string} message - 消息内容
   */
  recordBotMessage(serverId, message) {
    if (!this.messagesSentByBot.has(serverId)) {
      this.messagesSentByBot.set(serverId, []);
    }
    const messages = this.messagesSentByBot.get(serverId);
    messages.unshift(message);

    // 限制历史记录数量
    if (messages.length > this.BOT_MESSAGE_HISTORY_LIMIT) {
      messages.pop();
    }
  }

  /**
   * 检查是否是 bot 发送的消息（用于去重）
   * @param {string} serverId - 服务器 ID
   * @param {string} message - 消息内容
   * @returns {boolean} 是否是 bot 消息
   */
  isBotMessage(serverId, message) {
    const messages = this.messagesSentByBot.get(serverId);
    if (!messages) return false;

    const index = messages.indexOf(message);
    if (index !== -1) {
      // 找到后从列表中移除
      messages.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取队伍聊天历史
   * @param {string} serverId - 服务器 ID
   * @returns {Promise<Array>} 聊天历史
   */
  async getTeamChat(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getTeamChat: {} }, 15000);
    return res.teamChat?.messages || [];
  }

  /**
   * 移交队长权限
   * @param {string} serverId - 服务器 ID
   * @param {string} steamId - 目标玩家的 Steam ID
   * @returns {Promise<Object>} 操作结果
   */
  async promoteToLeader(serverId, steamId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    // steamId 需要是 Long 类型
    const targetSteamId = BigInt(steamId);
    const res = await rustplus.sendRequestAsync({
      promoteToLeader: { steamId: targetSteamId }
    });

    logger.debug(`👑 用户 ${this.userId} 移交队长权限给 ${steamId}`);
    return res;
  }

  /**
   * 获取队伍信息
   */
  async getTeamInfo(serverId) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ getTeamInfo: {} }, 15000);
    return res.teamInfo;
  }

  /**
   * 控制智能设备
   */
  async setEntityValue(serverId, entityId, value) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const res = await rustplus.sendRequestAsync({ entityId, setEntityValue: { value } });
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
      return { userId: this.userId, serverId, cameraId, subscribed: true };
    }

    const camera = rustplus.getCamera(cameraId);

    // 帧率限制：最小间隔 200ms（约 5 FPS），减少内存压力
    let lastFrameTime = 0;
    const MIN_FRAME_INTERVAL = 200;

    // 绑定事件
    camera.on('subscribing', () => this.emit('camera:subscribing', { userId: this.userId, serverId, cameraId }));
    camera.on('subscribed', () => this.emit('camera:subscribed', { userId: this.userId, serverId, cameraId }));
    camera.on('unsubscribed', () => this.emit('camera:unsubscribed', { userId: this.userId, serverId, cameraId }));
    camera.on('render', (buffer) => {
      try {
        // 帧率限制检查
        const now = Date.now();
        if (now - lastFrameTime < MIN_FRAME_INTERVAL) {
          return; // 跳过此帧
        }
        lastFrameTime = now;

        const imageBase64 = buffer.toString('base64');
        this.emit('camera:render', {
          userId: this.userId,
          serverId,
          cameraId,
          image: `data:image/png;base64,${imageBase64}`
        });
      } catch (e) {
        logger.warn(`用户 ${this.userId} 相机帧转码失败:`, e?.message || e);
      }
    });

    this.cameras.set(key, camera);
    await camera.subscribe();
    return { userId: this.userId, serverId, cameraId, subscribed: true };
  }

  async unsubscribeCamera(serverId, cameraId) {
    const key = this.makeCameraKey(serverId, cameraId);
    const camera = this.cameras.get(key);
    if (camera) {
      // 先移除所有事件监听器，防止内存泄漏
      camera.removeAllListeners();
      await camera.unsubscribe();
      this.cameras.delete(key);
    }
    return { userId: this.userId, serverId, cameraId, subscribed: false };
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
  async getEntityInfo(serverId, entityId, options = {}) {
    const rustplus = this.connections.get(serverId);
    if (!rustplus) throw new Error('服务器未连接');

    const timeoutMs = Number.isFinite(options?.timeoutMs) ? Number(options.timeoutMs) : undefined;
    const res = await rustplus.sendRequestAsync({ entityId, getEntityInfo: {} }, timeoutMs);
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
        userId: this.userId,
        serverId,
        message: msg.message,
        name: msg.name,
        steamId: msg.steamId,
        time: msg.time
      };

      // 发送队伍消息事件（命令处理将由 UserCommandsService 负责）
      this.emit('team:message', messageData);
    }

    // 队伍变化（包含玩家死亡/复活/上线/下线等状态变化）
    if (broadcast.teamChanged) {
      logger.debug(`📡 [广播] 用户 ${this.userId} 收到 teamChanged 广播 (serverId=${serverId})`);
      // 异步处理，不阻塞消息处理流程
      this.handleTeamChanged(serverId, broadcast.teamChanged).catch(err => {
        logger.error(`处理teamChanged失败:`, err.message);
      });
    }

    // 实体变化（设备状态改变）
    if (broadcast.entityChanged) {
      const { entityId, payload } = broadcast.entityChanged;
      this.emit('entity:changed', {
        userId: this.userId,
        serverId,
        entityId,
        value: payload.value,
        capacity: payload.capacity
      });
    }

    // 氏族变化
    if (broadcast.clanChanged) {
      this.emit('clan:changed', { userId: this.userId, serverId, data: broadcast.clanChanged });
    }

    // 氏族消息
    if (broadcast.clanMessage) {
      const { message: msg } = broadcast.clanMessage;
      this.emit('clan:message', {
        userId: this.userId,
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
      this.emit('camera:rays', { userId: this.userId, serverId, data: broadcast.cameraRays });
    }
  }

  /**
   * 处理队伍状态变化
   * 注意：玩家状态检测（死亡/上线/下线/AFK）将由 UserEventMonitorService 处理
   * 这里获取完整的teamInfo并转发，供前端使用
   */
  async handleTeamChanged(serverId, teamChanged) {
    try {
      // 获取完整的团队信息
      const teamInfo = await this.getTeamInfo(serverId);

      // 发送包含完整teamInfo的事件（供 WebSocket 广播等使用）
      this.emit('team:changed', {
        userId: this.userId,
        serverId,
        teamInfo,  // 添加完整的teamInfo供前端使用
        data: teamChanged  // 保留原始数据以供其他用途
      });
    } catch (error) {
      // 如果获取失败，仍然发送原始数据
      logger.warn(`用户 ${this.userId} 获取teamInfo失败 (${serverId}):`, error.message);
      this.emit('team:changed', { userId: this.userId, serverId, data: teamChanged });
    }
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
   * 获取连接统计信息
   */
  getStats() {
    return {
      userId: this.userId,
      totalServers: this.serverConfigs.size,
      connectedServers: this.connections.size,
      connectingServers: this.connecting.size,
      reconnectingServers: this.reconnectTimers.size,
      activeCameras: this.cameras.size
    };
  }
}

export default UserRustPlusManager;
