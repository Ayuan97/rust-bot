/**
 * UserServiceManager - 用户服务管理器
 * 每个用户一个实例，管理该用户的所有服务
 */

import { EventEmitter } from 'events';
import db from '../lib/db.js';
import DistributedRustPlusManager from './distributed-rustplus-manager.js';
import UserFCMManager from './user-fcm-manager.js';
import UserEventMonitor from './user-event-monitor.js';
import UserAutomation from './user-automation.js';
import UserCommands from './user-commands.js';
import DayNightNotifier from './day-night-notifier.js';
import UserTrackingService from './user-tracking.service.js';
import battlemetricsService from './battlemetrics.service.js';

class UserServiceManager extends EventEmitter {
  constructor(userId) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    this.userId = userId;
    this.isInitialized = false;
    this.isShuttingDown = false;

    // 用户信息
    this.user = null;
    this.logs = []; // 新增：日志缓冲区 (黑匣子)
    this.MAX_LOGS = 200; // 最多保留 200 条记录

    // 各个服务实例
    this.rustPlusService = new DistributedRustPlusManager(userId);  // Rust+ 分布式连接管理
    this.fcmService = new UserFCMManager(userId);            // FCM 推送监听
    this.eventMonitorService = new UserEventMonitor(userId, this.rustPlusService);  // 事件监控
    this.automationService = new UserAutomation(userId, this.rustPlusService);      // 设备自动化
    this.commandsService = new UserCommands(userId, this.rustPlusService, this.eventMonitorService);  // 游戏内命令
    this.dayNightNotifier = new DayNightNotifier(userId, this.rustPlusService);  // 昼夜提醒
    this.trackingService = new UserTrackingService(userId);  // 玩家追踪

    // 待确认的服务器配对数据（单服务器限制）
    this.pendingServerPairing = null;

    console.log(`👤 UserServiceManager 已创建 (userId: ${userId})`);
  }

  /**
   * 记录系统日志到黑匣子
   */
  log(module, message, level = 'INFO') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      module,
      message,
      level
    };
    this.logs.push(logEntry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }
    // 同时打印到控制台，方便调试
    console.log(`[${logEntry.timestamp}] [${module}] [${level}] ${message}`);
  }

  /**
   * 初始化用户服务
   * 加载用户数据并启动所有子服务
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        this.log('SYSTEM', '服务已在运行中');
        return;
      }

      this.log('SYSTEM', '开始初始化幸存者服务...');

      // 1. 加载用户数据
      await this._loadUserData();

      // 2. 初始化子服务（占位符，后续实现）
      await this._initializeServices();

      // 3. 连接到用户的服务器（占位符）
      await this._connectToServers();

      this.isInitialized = true;

      console.log(`✅ 用户 ${this.user.username} 的服务初始化完成`);

      this.emit('initialized', { userId: this.userId });
    } catch (error) {
      console.error(`❌ 初始化用户 ${this.userId} 的服务失败:`, error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 停止用户服务
   * 断开所有连接并清理资源
   */
  async shutdown() {
    try {
      if (this.isShuttingDown) {
        console.log(`⚠️  用户 ${this.userId} 的服务正在关闭中...`);
        return;
      }

      this.isShuttingDown = true;

      console.log(`🛑 停止用户 ${this.userId} 的服务...`);

      // 1. 断开服务器连接（占位符）
      await this._disconnectServers();

      // 2. 停止所有子服务（占位符）
      await this._shutdownServices();

      this.isInitialized = false;
      this.isShuttingDown = false;

      console.log(`✅ 用户 ${this.userId} 的服务已停止`);

      this.emit('shutdown', { userId: this.userId });
    } catch (error) {
      console.error(`❌ 停止用户 ${this.userId} 的服务失败:`, error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 加载用户数据
   * @private
   */
  async _loadUserData() {
    try {
      // 查询用户基本信息和订阅
      const [userRows] = await db.query(
        `SELECT u.*, s.id as subscriptionId, s.planType, s.status as subscriptionStatus, s.startDate, s.endDate
         FROM users u
         LEFT JOIN subscriptions s ON u.id = s.userId
         WHERE u.id = ?`,
        [this.userId]
      );

      if (!userRows[0]) {
        throw new Error('用户不存在');
      }

      this.user = userRows[0];

      if (!this.user.isActive) {
        throw new Error('用户已被禁用');
      }

      // 查询服务器
      const [servers] = await db.query(
        'SELECT * FROM servers WHERE userId = ?',
        [this.userId]
      );

      // 查询每个服务器的设备
      for (const server of servers) {
        const [devices] = await db.query(
          'SELECT * FROM devices WHERE serverId = ?',
          [server.id]
        );
        server.devices = devices;
      }

      this.user.servers = servers;

      // 查询通知设置
      const [settingsRows] = await db.query(
        'SELECT * FROM notification_settings WHERE userId = ?',
        [this.userId]
      );
      this.user.notification_settings = settingsRows[0] || null;

      // 构建 subscriptions 对象以保持兼容性
      if (this.user.subscriptionId) {
        this.user.subscriptions = {
          id: this.user.subscriptionId,
          planType: this.user.planType,
          status: this.user.subscriptionStatus,
          startDate: this.user.startDate,
          endDate: this.user.endDate
        };
      } else {
        this.user.subscriptions = null;
      }

      console.log(`  📊 已加载用户数据: ${this.user.username}`);
      console.log(`  📊 服务器数量: ${this.user.servers.length}`);
    } catch (error) {
      throw new Error(`加载用户数据失败: ${error.message}`);
    }
  }

  /**
   * 初始化所有子服务
   * @private
   */
  async _initializeServices() {
    try {
      console.log(`  🔧 初始化子服务...`);

      // 1. 自动启动 FCM 监听 (如果有凭证)
      if (this.user.servers && this.user.servers.length > 0) {
        const serverWithCreds = this.user.servers.find(s => s.fcmCredentials);
        if (serverWithCreds) {
          try {
            this.log('FCM', `发现已保存的 FCM 凭证 (来源: ${serverWithCreds.name})，正在自动启动监听...`);
            await this.fcmService.start(serverWithCreds.fcmCredentials);
          } catch (error) {
            this.log('FCM', `自动启动失败: ${error.message}`, 'ERROR');
          }
        } else {
          this.log('FCM', '未找到保存的凭证，跳过自动启动');
        }
      }

      // 2. 绑定 RustPlus 事件到 UserServiceManager（转发所有事件）
      this.rustPlusService.on('server:connected', (data) => {
        // this.log('RUST+', `服务器 ${data.serverId} 已连接`);
        this.emit('server:connected', data);
      });

      this.rustPlusService.on('server:disconnected', (data) => {
        // this.log('RUST+', `服务器 ${data.serverId} 已断开`, 'WARN');
        this.emit('server:disconnected', data);
      });

      this.rustPlusService.on('server:error', (data) => {
        // this.log('RUST+', `服务器 ${data.serverId} 错误: ${data.error}`, 'ERROR');
        this.emit('server:error', data);
      });

      this.rustPlusService.on('server:reconnecting', (data) => {
        // this.log('RUST+', `服务器 ${data.serverId} 正在重新连接...`);
        this.emit('server:reconnecting', data);
      });

      this.rustPlusService.on('rust:message', (data) => {
        this.emit('rust:message', data);
      });

      this.rustPlusService.on('team:message', (data) => {
        // 检查是否是 bot 自己发送的消息（避免命令输出被再次触发，导致无限循环）
        if (this.rustPlusService.isBotMessage(data.serverId, data.message)) {
          this.log('CHAT', `[团队] [BOT] ${data.message}`);
          return; // 跳过 bot 自己的消息
        }

        this.log('CHAT', `[团队] ${data.name}: ${data.message}`);
        // 转发事件
        this.emit('team:message', data);

        // 处理命令（如果消息以 ! 开头）
        if (this.commandsService && data.message && data.message.startsWith('!')) {
          this.commandsService.handleMessage(
            data.serverId,
            data.name,
            data.steamId,
            data.message
          ).catch(error => {
            this.log('CMD', `命令处理失败: ${error.message}`, 'ERROR');
          });
        }
      });

      this.rustPlusService.on('team:changed', (data) => {
        this.emit('team:changed', { ...data, userId: this.userId });
      });

      this.rustPlusService.on('entity:changed', async (data) => {
        const eventData = { ...data, userId: this.userId };
        this.emit('entity:changed', eventData);

        // 如果状态变为开启 (true)，检查是否是警报器需要触发逻辑
        if (data.value === true) {
          try {
            const [deviceRows] = await db.query(
              'SELECT * FROM devices WHERE serverId = ? AND entityId = ?',
              [data.serverId, parseInt(data.entityId)]
            );

            const device = deviceRows[0];

            if (device && device.type === 'ALARM') {
              await this._handleAlarmTriggered({
                serverId: data.serverId,
                entityId: data.entityId,
                time: Date.now()
              });
            } else {
              // 对于非警报设备（如开关），也记录状态变化到日志
              await this.eventMonitorService.saveEventLog(data.serverId, 'entity:changed', {
                entityId: data.entityId,
                name: device?.name || `设备 ${data.entityId}`,
                value: data.value,
                time: Date.now()
              });
            }
          } catch (error) {
            console.error('检查设备类型并触发警报失败:', error.message);
          }
        } else {
          // 状态变为关闭也记录日志
          try {
            const [deviceRows] = await db.query(
              'SELECT * FROM devices WHERE serverId = ? AND entityId = ?',
              [data.serverId, parseInt(data.entityId)]
            );
            const device = deviceRows[0];
            await this.eventMonitorService.saveEventLog(data.serverId, 'entity:changed', {
              entityId: data.entityId,
              name: device?.name || `设备 ${data.entityId}`,
              value: data.value,
              time: Date.now()
            });
          } catch (e) {
            console.error('记录设备状态变化失败:', e.message);
          }
        }
      });

      this.rustPlusService.on('alarm:triggered', async (data) => {
        // 处理警报触发
        await this._handleAlarmTriggered(data);
      });

      this.rustPlusService.on('clan:changed', (data) => {
        this.emit('clan:changed', data);
      });

      this.rustPlusService.on('clan:message', (data) => {
        this.emit('clan:message', data);
      });

      this.rustPlusService.on('camera:subscribing', (data) => {
        this.emit('camera:subscribing', data);
      });

      this.rustPlusService.on('camera:subscribed', (data) => {
        this.emit('camera:subscribed', data);
      });

      this.rustPlusService.on('camera:unsubscribed', (data) => {
        this.emit('camera:unsubscribed', data);
      });

      this.rustPlusService.on('camera:render', (data) => {
        this.emit('camera:render', data);
      });

      this.rustPlusService.on('camera:rays', (data) => {
        this.emit('camera:rays', data);
      });

      // 3. 绑定 FCM 事件到 UserServiceManager
      this.fcmService.on('server:paired', async (data) => {
        console.log(`  🎮 收到服务器配对推送: ${data.name}`);
        this.emit('server:paired', data);

        // 自动处理配对：保存到数据库并连接
        await this._handleServerPairing(data);
      });

      this.fcmService.on('entity:paired', async (data) => {
        console.log(`  🔌 收到设备配对推送`);
        this.emit('entity:paired', data);

        // 自动处理设备配对：保存到数据库
        await this._handleEntityPairing(data);
      });

      this.fcmService.on('listening', (data) => {
        console.log(`  👂 FCM 监听已启动`);
        this.emit('fcm:listening', data);
      });

      this.fcmService.on('stopped', (data) => {
        console.log(`  🛑 FCM 监听已停止`);
        this.emit('fcm:stopped', data);
      });

      this.fcmService.on('error', (data) => {
        console.error(`  ⚠️  FCM 错误:`, data.error);
        this.emit('fcm:error', data);
      });

      // 4. 绑定 EventMonitor 事件到 UserServiceManager
      // 转发所有事件（事件已包含 userId）
      this.eventMonitorService.on('cargo:spawn', (data) => {
        this.emit('cargo:spawn', data);
      });

      this.eventMonitorService.on('cargo:egress', (data) => {
        this.emit('cargo:egress', data);
      });

      this.eventMonitorService.on('cargo:dock', (data) => {
        this.emit('cargo:dock', data);
      });

      this.eventMonitorService.on('cargo:leave', (data) => {
        this.emit('cargo:leave', data);
      });

      this.eventMonitorService.on('heli:spawn', (data) => {
        this.emit('heli:spawn', data);
      });

      this.eventMonitorService.on('heli:downed', (data) => {
        this.emit('heli:downed', data);
      });

      this.eventMonitorService.on('heli:leave', (data) => {
        this.emit('heli:leave', data);
      });

      this.eventMonitorService.on('player:died', (data) => {
        this.emit('player:died', { ...data, userId: this.userId });
      });

      this.eventMonitorService.on('player:online', (data) => {
        this.emit('player:online', { ...data, userId: this.userId });
      });

      this.eventMonitorService.on('player:offline', (data) => {
        this.emit('player:offline', { ...data, userId: this.userId });
      });

      this.eventMonitorService.on('player:afk', (data) => {
        this.emit('player:afk', { ...data, userId: this.userId });
      });

      this.eventMonitorService.on('player:contribution', (data) => {
        this.emit('player:contribution', { ...data, userId: this.userId });
      });

      // 5. 绑定 Automation 事件到 UserServiceManager
      this.automationService.on('automation:executed', (data) => {
        this.emit('automation:executed', { ...data, userId: this.userId });
      });

      // 6. 绑定 Tracking 事件到 UserServiceManager
      this.trackingService.on('tracking:online', (data) => {
        this.log('TRACKING', `玩家上线: ${data.playerName} @ ${data.serverName || '未知服务器'}`);
        this.emit('tracking:online', data);
      });

      this.trackingService.on('tracking:offline', (data) => {
        this.log('TRACKING', `玩家下线: ${data.playerName}`);
        this.emit('tracking:offline', data);
      });

      this.trackingService.on('tracking:server_change', (data) => {
        this.log('TRACKING', `玩家换服: ${data.playerName} ${data.fromServerName} -> ${data.toServerName}`);
        this.emit('tracking:server_change', data);
      });

      console.log(`  [OK] 子服务初始化完成`);
    } catch (error) {
      throw new Error(`初始化子服务失败: ${error.message}`);
    }
  }

  /**
   * 连接到用户的所有服务器
   * @private
   */
  async _connectToServers() {
    try {
      if (!this.user.servers || this.user.servers.length === 0) {
        console.log(`  ℹ️  用户没有配置服务器`);
        return;
      }

      console.log(`  🔌 连接到 ${this.user.servers.length} 个服务器...`);

      // 连接到所有服务器（并发连接）
      const connectionPromises = this.user.servers.map(async (server) => {
        try {
          const connectResult = await this.rustPlusService.connect({
            serverId: server.id,
            ip: server.ip,
            port: server.port,
            playerId: server.playerId,
            playerToken: server.playerToken
          });
          if (connectResult?.queued) {
            console.log(`  ⏳ 服务器进入分布式连接队列: ${server.name || server.id} (position=${connectResult.queuePosition || 1})`);
          } else if (connectResult?.assigned && !connectResult.connected) {
            console.log(`  🔄 服务器已分配连接节点: ${server.name || server.id}`);
          } else {
            console.log(`  ✅ 已连接到服务器: ${server.name || server.id}`);
          }

          // 自动查找并关联 Battlemetrics ID（如果尚未关联）
          if (!server.battlemetricsId) {
            try {
              const bmId = await battlemetricsService.searchServerByAddress(server.ip, server.port, server.name);
              if (bmId) {
                await db.query(
                  'UPDATE servers SET battlemetricsId = ?, updatedAt = NOW() WHERE id = ?',
                  [bmId, server.id]
                );
                server.battlemetricsId = bmId;
                console.log(`  🔗 已关联 Battlemetrics ID: ${bmId}`);
              }
            } catch (bmError) {
              console.log(`  ⚠️  查找 Battlemetrics ID 失败: ${bmError.message}`);
            }
          }

          // 连接成功后启动事件监控和自动化
          if (this.eventMonitorService) {
            await this.eventMonitorService.start(server.id);
          }
          if (this.automationService) {
            this.automationService.start(server.id);
          }
          if (this.dayNightNotifier) {
            await this.dayNightNotifier.start(server.id);
          }
        } catch (error) {
          console.error(`  ❌ 连接服务器 ${server.name || server.id} 失败:`, error.message);
          // 不抛出错误，允许部分失败
        }
      });

      // 等待所有连接尝试完成
      await Promise.allSettled(connectionPromises);

      const connectedCount = this.rustPlusService.getConnectedServers().length;
      console.log(`  [OK] 服务器连接完成: ${connectedCount}/${this.user.servers.length} 个成功`);

      // 启动玩家追踪服务
      if (this.trackingService) {
        try {
          await this.trackingService.start();
        } catch (error) {
          console.error(`  [WARN] 启动追踪服务失败:`, error.message);
        }
      }
    } catch (error) {
      console.error(`  [WARN]  连接服务器失败: ${error.message}`);
      // 不抛出错误，允许部分失败
    }
  }

  /**
   * 断开所有服务器连接
   * @private
   */
  async _disconnectServers() {
    try {
      console.log(`  🔌 断开服务器连接...`);

      // 使用 RustPlus 服务断开所有连接
      if (this.rustPlusService) {
        await this.rustPlusService.disconnectAll();
      }

      console.log(`  ✅ 服务器已断开`);
    } catch (error) {
      console.error(`  ⚠️  断开服务器失败: ${error.message}`);
    }
  }

  /**
   * 停止所有子服务
   * @private
   */
  async _shutdownServices() {
    try {
      console.log(`  🔧 停止子服务...`);

      // 停止 FCM 监听
      if (this.fcmService && this.fcmService.isListening) {
        try {
          this.fcmService.stop();
        } catch (error) {
          console.error(`  ⚠️  停止 FCM 服务失败:`, error.message);
        }
      }

      // 停止事件监控
      if (this.eventMonitorService) {
        try {
          this.eventMonitorService.stopAll();
        } catch (error) {
          console.error(`  ⚠️  停止事件监控服务失败:`, error.message);
        }
      }

      // 停止自动化
      if (this.automationService) {
        try {
          this.automationService.stopAll();
        } catch (error) {
          console.error(`  ⚠️  停止自动化服务失败:`, error.message);
        }
      }

      // 停止命令服务
      if (this.commandsService) {
        try {
          this.commandsService.destroy();
        } catch (error) {
          console.error(`  ⚠️  停止命令服务失败:`, error.message);
        }
      }

      // 停止昼夜提醒服务
      if (this.dayNightNotifier) {
        try {
          this.dayNightNotifier.stopAll();
        } catch (error) {
          console.error(`  ⚠️  停止昼夜提醒服务失败:`, error.message);
        }
      }

      // 停止追踪服务
      if (this.trackingService) {
        try {
          this.trackingService.stop();
        } catch (error) {
          console.error(`  [WARN] 停止追踪服务失败:`, error.message);
        }
      }

      // 清理所有子服务的事件监听器，防止内存泄漏
      if (this.rustPlusService) {
        if (typeof this.rustPlusService.destroy === 'function') {
          this.rustPlusService.destroy();
        }
        this.rustPlusService.removeAllListeners();
      }
      if (this.fcmService) {
        this.fcmService.removeAllListeners();
      }
      if (this.eventMonitorService) {
        this.eventMonitorService.removeAllListeners();
      }
      if (this.automationService) {
        this.automationService.removeAllListeners();
      }
      if (this.trackingService) {
        this.trackingService.removeAllListeners();
      }

      console.log(`  [OK] 子服务已停止`);
    } catch (error) {
      console.error(`  ⚠️  停止子服务失败: ${error.message}`);
    }
  }

  /**
   * 获取用户信息
   */
  getUserInfo() {
    return this.user ? {
      id: this.user.id,
      username: this.user.username,
      email: this.user.email,
      isActive: this.user.isActive,
      subscriptions: this.user.subscriptions
    } : null;
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const rustPlusStats = this.rustPlusService ? this.rustPlusService.getStats() : null;
    const fcmStatus = this.fcmService ? this.fcmService.getStatus() : null;
    const eventMonitorStatus = this.eventMonitorService ? {
      monitoringServers: Array.from(this.eventMonitorService.pollIntervals.keys())
    } : null;
    const automationStatus = this.automationService ? {
      activeServers: Array.from(this.automationService.pollIntervals.keys())
    } : null;
    const trackingStatus = this.trackingService ? this.trackingService.getStatus() : null;

    return {
      userId: this.userId,
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      serverCount: this.user?.servers?.length || 0,
      connectedServers: rustPlusStats?.connectedServers || 0,
      logs: this.logs, // 新增：返回日志
      services: {
        rustPlus: !!this.rustPlusService,
        fcm: !!this.fcmService,
        eventMonitor: !!this.eventMonitorService,
        automation: !!this.automationService,
        commands: !!this.commandsService,
        dayNight: !!this.dayNightNotifier,
        tracking: !!this.trackingService
      },
      rustPlusStats,
      fcmStatus,
      eventMonitorStatus,
      automationStatus,
      trackingStatus
    };
  }
  /**
   * 处理服务器配对事件
   * 保存服务器信息并建立连接
   * @private
   */
  async _handleServerPairing(data) {
    try {
      this.log('PAIRING', `正在处理服务器配对: ${data.name} (${data.ip}:${data.port})`);

      // 1. 检查用户现有的真实服务器（排除 FCM 占位符）
      const [existingServers] = await db.query(
        `SELECT * FROM servers
         WHERE userId = ? AND ip != '0.0.0.0' AND id NOT LIKE 'fcm-%'`,
        [this.userId]
      );

      // 2. 检查是否是同一服务器的更新（IP:Port 相同）
      const isSameServer = existingServers.some(
        s => s.ip === data.ip && s.port === String(data.port)
      );

      // 3. 如果已有不同服务器，直接执行替换
      if (existingServers.length > 0 && !isSameServer) {
        const oldServer = existingServers[0];

        this.log('PAIRING', `检测到需要替换服务器: ${oldServer.name} -> ${data.name}`);

        // 直接执行替换
        await this._executeServerReplace(oldServer, data);
        return;
      }

      // 4. 无需替换，直接执行配对
      await this._executeServerPairing(data);

    } catch (error) {
      this.log('PAIRING', `配对处理失败: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  /**
   * 执行服务器替换（删除旧服务器，配对新服务器）
   * @private
   */
  async _executeServerReplace(oldServer, newServer) {
    try {
      this.log('PAIRING', `正在替换服务器: ${oldServer.name} -> ${newServer.name}`);

      // 1. 断开旧服务器连接
      if (this.rustPlusService.isConnected(oldServer.id)) {
        await this.rustPlusService.disconnect(oldServer.id);
      }

      // 2. 停止旧服务器的相关服务
      this.eventMonitorService.stop(oldServer.id);
      this.automationService.stop(oldServer.id);
      this.dayNightNotifier.stop(oldServer.id);

      // 3. 删除旧服务器（先删除关联的设备和事件日志）
      await db.query('DELETE FROM devices WHERE serverId = ?', [oldServer.id]);
      await db.query('DELETE FROM event_logs WHERE serverId = ?', [oldServer.id]);
      await db.query('DELETE FROM servers WHERE id = ?', [oldServer.id]);

      this.log('PAIRING', `已删除旧服务器: ${oldServer.name}`);

      // 4. 执行新服务器配对
      await this._executeServerPairing(newServer);

    } catch (error) {
      this.log('PAIRING', `替换服务器失败: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  /**
   * 执行实际的服务器配对逻辑
   * @private
   */
  async _executeServerPairing(data) {
    // 生成用户专属的服务器 ID（防止不同用户配对同一服务器时 ID 冲突）
    let userServerId = `${this.userId}_${data.id}`;

    // 1. 保存/更新服务器信息到数据库
    const serverData = {
      name: data.name,
      ip: data.ip,
      port: String(data.port),
      playerId: data.playerId,
      playerToken: data.playerToken,
      userId: this.userId,
      id: userServerId,
      updatedAt: new Date()
    };

    // 使用 userId + ip + port 作为查找条件（多租户隔离）
    const [existingRows] = await db.query(
      'SELECT * FROM servers WHERE userId = ? AND ip = ? AND port = ?',
      [this.userId, data.ip, String(data.port)]
    );

    const existing = existingRows[0];

    if (existing) {
      // 检查是否需要更新：对比 playerId 和 playerToken
      const needsUpdate = existing.playerId !== data.playerId ||
        existing.playerToken !== data.playerToken ||
        existing.name !== data.name;

      // 检查是否已连接
      const isConnected = this.rustPlusService.connections.has(existing.id);

      // 如果信息未变更且已连接，跳过处理
      if (!needsUpdate && isConnected) {
        this.log('PAIRING', `服务器 ${data.name} 已存在且已连接，跳过重复配对`);
        return;
      }

      // 如果需要更新，则更新数据库
      if (needsUpdate) {
        await db.query(
          `UPDATE servers SET name = ?, playerId = ?, playerToken = ?, updatedAt = NOW()
           WHERE id = ?`,
          [serverData.name, serverData.playerId, serverData.playerToken, existing.id]
        );
        this.log('PAIRING', `更新服务器信息: ${data.name}`);

        // 凭证已更新且已连接，需要断开旧连接再重连
        if (isConnected) {
          this.log('PAIRING', `凭证已更新，断开旧连接准备重连...`);
          await this.rustPlusService.disconnect(existing.id);
        }
      }

      // 更新 userServerId 为已存在的服务器 ID
      userServerId = existing.id;
    } else {
      await db.query(
        `INSERT INTO servers (id, userId, name, ip, port, playerId, playerToken, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [serverData.id, serverData.userId, serverData.name, serverData.ip, serverData.port, serverData.playerId, serverData.playerToken]
      );
      this.log('PAIRING', `保存新服务器信息: ${data.name}`);
    }

    // 2. 更新内存中的用户数据
    await this._loadUserData();

    // 3. 发起新连接
    this.log('PAIRING', `正在连接到服务器...`);
    await this.rustPlusService.connect({
      serverId: userServerId,
      ip: data.ip,
      port: data.port,
      playerId: data.playerId,
      playerToken: data.playerToken
    });

    // 4. 启动相关子服务
    this.log('PAIRING', `正在启动实时监控与自动化服务...`);
    try {
      await this.eventMonitorService.start(userServerId);
      await this.automationService.start(userServerId);
      await this.dayNightNotifier.start(userServerId);
      this.log('PAIRING', `所有实时服务已就绪`);
    } catch (svcError) {
      this.log('PAIRING', `实时服务启动失败: ${svcError.message}`, 'WARN');
    }
  }

  /**
   * 处理设备配对事件
   * 保存设备信息到数据库
   * @private
   */
  async _handleEntityPairing(data) {
    try {
      this.log('ENTITY_PAIRING', `正在处理设备配对: entityId=${data.entityId}, type=${data.entityType}`);

      // 验证必要字段
      if (!data.entityId || !data.originalServerId) {
        this.log('ENTITY_PAIRING', `设备配对数据不完整: entityId=${data.entityId}, originalServerId=${data.originalServerId}`, 'WARN');
        return;
      }

      // 生成用户专属的服务器 ID（与服务器配对保持一致）
      const userServerId = `${this.userId}_${data.originalServerId}`;

      // 检查服务器是否存在
      const [serverRows] = await db.query(
        'SELECT id FROM servers WHERE id = ? AND userId = ?',
        [userServerId, this.userId]
      );

      // 如果服务器不存在，尝试自动创建
      if (serverRows.length === 0) {
        if (data.serverInfo && data.serverInfo.ip && data.serverInfo.port) {
          this.log('ENTITY_PAIRING', `服务器不存在，正在自动创建: ${data.serverInfo.name}`);

          // 检查是否已有相同 IP:Port 的服务器
          const [existingByIp] = await db.query(
            'SELECT id FROM servers WHERE userId = ? AND ip = ? AND port = ?',
            [this.userId, data.serverInfo.ip, String(data.serverInfo.port)]
          );

          if (existingByIp.length > 0) {
            // 使用已存在的服务器 ID
            const existingServerId = existingByIp[0].id;
            this.log('ENTITY_PAIRING', `找到已存在的服务器 (IP:Port匹配): ${existingServerId}`);
            data.serverId = existingServerId;
          } else {
            // 创建新服务器
            await db.query(
              `INSERT INTO servers (id, userId, name, ip, port, playerId, playerToken, img, url, description, isActive, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
              [
                userServerId,
                this.userId,
                data.serverInfo.name,
                data.serverInfo.ip,
                String(data.serverInfo.port),
                data.serverInfo.playerId || '',
                data.serverInfo.playerToken || '',
                data.serverInfo.img || null,
                data.serverInfo.url || null,
                data.serverInfo.desc || null
              ]
            );
            this.log('ENTITY_PAIRING', `已自动创建服务器: ${data.serverInfo.name}`);
            data.serverId = userServerId;
          }
        } else {
          this.log('ENTITY_PAIRING', `服务器不存在且缺少创建所需信息，无法保存设备`, 'WARN');
          return;
        }
      } else {
        data.serverId = userServerId;
      }

      // 确定设备类型
      let deviceType = 'SWITCH'; // 默认类型
      if (data.entityType) {
        const typeNum = parseInt(data.entityType);
        switch (typeNum) {
          case 1: // Smart Switch
            deviceType = 'SWITCH';
            break;
          case 2: // Smart Alarm
            deviceType = 'ALARM';
            break;
          case 3: // Storage Monitor
            deviceType = 'STORAGE';
            break;
          default:
            deviceType = 'SWITCH';
        }
      }

      const entityId = parseInt(data.entityId);
      const deviceId = `${data.serverId}_${entityId}`;

      const deviceData = {
        id: deviceId,
        serverId: data.serverId,
        userId: this.userId,
        entityId: entityId,
        name: data.entityName || `设备 ${entityId}`,
        type: deviceType,
        isActive: true,
        reachable: true,
        updatedAt: new Date()
      };

      // 检查设备是否已存在
      const [existingDevices] = await db.query(
        'SELECT * FROM devices WHERE serverId = ? AND entityId = ?',
        [data.serverId, entityId]
      );

      const existing = existingDevices[0];

      if (existing) {
        // 更新已存在的设备
        await db.query(
          `UPDATE devices SET name = ?, type = ?, isActive = 1, reachable = 1, updatedAt = NOW()
           WHERE id = ?`,
          [deviceData.name, deviceType, existing.id]
        );
        this.log('ENTITY_PAIRING', `更新已存在的设备: ${deviceData.name} (${deviceType})`);
      } else {
        // 创建新设备
        await db.query(
          `INSERT INTO devices (id, serverId, userId, entityId, name, type, isActive, reachable, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
          [deviceId, data.serverId, this.userId, entityId, deviceData.name, deviceType]
        );
        this.log('ENTITY_PAIRING', `保存新设备: ${deviceData.name} (${deviceType})`);
      }

      // 重新加载用户数据以确保同步
      await this._loadUserData();

      // 发出设备配对成功事件
      this.emit('entity:paired:success', {
        userId: this.userId,
        serverId: data.serverId,
        device: deviceData
      });

      this.log('ENTITY_PAIRING', `设备配对处理完成: ${deviceData.name}`);

    } catch (error) {
      this.log('ENTITY_PAIRING', `设备配对处理失败: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  /**
   * 处理警报触发事件
   * 查询设备信息，更新触发时间，发送游戏内消息
   * @private
   */
  async _handleAlarmTriggered(data) {
    try {
      const { serverId, entityId, time } = data;

      this.log('ALARM', `警报触发: serverId=${serverId}, entityId=${entityId}`);

      // 1. 从数据库查询设备信息
      const [deviceRows] = await db.query(
        'SELECT * FROM devices WHERE serverId = ? AND entityId = ?',
        [serverId, parseInt(entityId)]
      );

      const device = deviceRows[0];

      if (!device || device.type !== 'ALARM') {
        if (!device) {
          this.log('ALARM', `未找到设备记录: entityId=${entityId}`, 'WARN');
        } else {
          this.log('ALARM', `设备类型不是警报器 (type=${device.type})，忽略触发逻辑`, 'DEBUG');
          return;
        }
        // 对于未记录的设备，如果确实收到了警报请求（虽然现在流程上应该不会了），仍发出基础事件但不发消息
        this.emit('alarm:triggered', {
          ...data,
          deviceName: `设备 ${entityId}`,
          message: null
        });
        return;
      }

      // 2. 更新 lastTrigger 时间
      await db.query(
        'UPDATE devices SET lastTrigger = ?, updatedAt = NOW() WHERE id = ?',
        [new Date(time), device.id]
      );

      // 3. 构建警报消息
      const deviceName = device.name || `警报 ${entityId}`;
      const customMessage = device.message;

      // 游戏内消息格式
      let chatMessage = `[警报] ${deviceName}`;
      if (customMessage) {
        chatMessage += `: ${customMessage}`;
      }

      // 4. 发送游戏内聊天消息
      try {
        await this.rustPlusService.sendTeamMessage(serverId, chatMessage, { isBot: true });
        this.log('ALARM', `已发送警报消息到游戏: ${chatMessage}`);
      } catch (chatError) {
        this.log('ALARM', `发送警报消息失败: ${chatError.message}`, 'ERROR');
      }

      // 5. 保存到历史记录
      await this.eventMonitorService.saveEventLog(serverId, 'alarm:triggered', {
        entityId,
        deviceName,
        message: customMessage,
        time
      });

      // 6. 发出事件（用于前端 WebSocket 通知）
      this.emit('alarm:triggered', {
        userId: this.userId,
        serverId,
        entityId,
        deviceName,
        message: customMessage,
        time
      });

      this.log('ALARM', `警报处理完成: ${deviceName}`);

    } catch (error) {
      this.log('ALARM', `警报处理失败: ${error.message}`, 'ERROR');
      console.error(error);
      // 仍然发出基本事件
      this.emit('alarm:triggered', data);
    }
  }
}

export default UserServiceManager;
