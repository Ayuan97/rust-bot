/**
 * UserServiceManager - 用户服务管理器
 * 每个用户一个实例，管理该用户的所有服务
 */

import { EventEmitter } from 'events';
import prisma from '../lib/prisma.js';
import UserRustPlusManager from './user-rustplus-manager.js';
import UserFCMManager from './user-fcm-manager.js';
import UserEventMonitor from './user-event-monitor.js';
import UserAutomation from './user-automation.js';
import UserCommands from './user-commands.js';
import DayNightNotifier from './day-night-notifier.js';
import UserEventPrediction from './user-event-prediction.js';

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
    this.rustPlusService = new UserRustPlusManager(userId);  // Rust+ 连接管理
    this.fcmService = new UserFCMManager(userId);            // FCM 推送监听
    this.eventMonitorService = new UserEventMonitor(userId, this.rustPlusService);  // 事件监控
    this.automationService = new UserAutomation(userId, this.rustPlusService);      // 设备自动化
    this.commandsService = new UserCommands(userId, this.rustPlusService, this.eventMonitorService);  // 游戏内命令
    this.dayNightNotifier = new DayNightNotifier(userId, this.rustPlusService);  // 昼夜提醒
    this.predictionService = new UserEventPrediction(userId, this.rustPlusService, this.eventMonitorService);  // 事件预测

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
      this.user = await prisma.users.findUnique({
        where: { id: this.userId },
        include: {
          subscriptions: true,
          servers: {
            include: {
              devices: true
            }
          },
          notification_settings: true
        }
      });

      if (!this.user) {
        throw new Error('用户不存在');
      }

      if (!this.user.isActive) {
        throw new Error('用户已被禁用');
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

      // 1. 加载全局代理配置并应用
      const proxyConfig = await prisma.proxy_config.findUnique({ where: { id: 1 } });
      if (proxyConfig && proxyConfig.subscriptionUrl) {
        // 如果代理服务正在运行，获取 Agent 和配置
        const proxyService = (await import('./proxy.service.js')).default;
        if (proxyService.isRunning) {
          const proxyAgent = proxyService.getProxyAgent();
          const socksHost = '127.0.0.1';
          const socksPort = proxyConfig.proxyPort || 10808;

          this.rustPlusService.setProxyConfig({ host: socksHost, port: socksPort });
          this.fcmService.setProxyConfig({ host: socksHost, port: socksPort });
          this.fcmService.setProxyAgent(proxyAgent);
          this.log('PROXY', `已应用全局代理配置 (端口: ${socksPort})`);
        }
      }

      // 1.5. 自动启动 FCM 监听 (如果有凭证)
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
        this.log('RUST+', `服务器 ${data.serverId} 已连接`);
        this.emit('server:connected', data);
      });

      this.rustPlusService.on('server:disconnected', (data) => {
        this.log('RUST+', `服务器 ${data.serverId} 已断开`, 'WARN');
        this.emit('server:disconnected', data);
      });

      this.rustPlusService.on('server:error', (data) => {
        this.log('RUST+', `服务器 ${data.serverId} 错误: ${data.error}`, 'ERROR');
        this.emit('server:error', data);
      });

      this.rustPlusService.on('server:reconnecting', (data) => {
        this.log('RUST+', `服务器 ${data.serverId} 正在重新连接...`);
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
            const device = await prisma.devices.findFirst({
              where: {
                serverId: data.serverId,
                entityId: parseInt(data.entityId)
              }
            });

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
            const device = await prisma.devices.findFirst({
              where: { serverId: data.serverId, entityId: parseInt(data.entityId) }
            });
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

      // 转发事件到预测服务进行学习
      this.eventMonitorService.on('cargo:spawn', async (data) => {
        try {
          await this.predictionService.recordEvent(data.serverId, 'CARGO_SPAWN', data.time);
        } catch (e) {
          this.log('PREDICTION', `记录货船事件失败: ${e.message}`, 'ERROR');
        }
      });

      this.eventMonitorService.on('patrol_heli:spawn', async (data) => {
        try {
          await this.predictionService.recordEvent(data.serverId, 'HELI_SPAWN', data.time);
        } catch (e) {
          this.log('PREDICTION', `记录直升机事件失败: ${e.message}`, 'ERROR');
        }
      });

      this.eventMonitorService.on('small_oil_rig:triggered', async (data) => {
        try {
          await this.predictionService.recordOilRigCooldown(data.serverId, 'small', data.time);
        } catch (e) {
          this.log('PREDICTION', `记录小油井事件失败: ${e.message}`, 'ERROR');
        }
      });

      this.eventMonitorService.on('large_oil_rig:triggered', async (data) => {
        try {
          await this.predictionService.recordOilRigCooldown(data.serverId, 'large', data.time);
        } catch (e) {
          this.log('PREDICTION', `记录大油井事件失败: ${e.message}`, 'ERROR');
        }
      });

      // 5. 绑定 Automation 事件到 UserServiceManager
      this.automationService.on('automation:executed', (data) => {
        this.emit('automation:executed', { ...data, userId: this.userId });
      });

      // 6. 绑定 Prediction 事件到 UserServiceManager
      this.predictionService.on('prediction:created', (data) => {
        this.log('PREDICTION', `生成预测: ${data.eventTypeName} @ ${new Date(data.prediction.predictedTime).toLocaleString()}`);
        this.emit('prediction:created', data);
      });

      this.predictionService.on('prediction:notified', (data) => {
        this.log('PREDICTION', `预测通知已发送: ${data.eventTypeName}`);
        this.emit('prediction:notified', data);
      });

      this.predictionService.on('prediction:occurred', (data) => {
        this.log('PREDICTION', `预测事件已发生: ${data.eventTypeName}`);
        this.emit('prediction:occurred', data);
      });

      this.predictionService.on('patterns:reset', (data) => {
        this.log('PREDICTION', `学习数据已重置`);
        this.emit('patterns:reset', data);
      });

      console.log(`  ✅ 子服务初始化完成`);
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
          await this.rustPlusService.connect({
            serverId: server.id,
            ip: server.ip,
            port: server.port,
            playerId: server.playerId,
            playerToken: server.playerToken
          });
          console.log(`  ✅ 已连接到服务器: ${server.name || server.id}`);

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
          if (this.predictionService) {
            await this.predictionService.start(server.id);
          }
        } catch (error) {
          console.error(`  ❌ 连接服务器 ${server.name || server.id} 失败:`, error.message);
          // 不抛出错误，允许部分失败
        }
      });

      // 等待所有连接尝试完成
      await Promise.allSettled(connectionPromises);

      const connectedCount = this.rustPlusService.getConnectedServers().length;
      console.log(`  ✅ 服务器连接完成: ${connectedCount}/${this.user.servers.length} 个成功`);
    } catch (error) {
      console.error(`  ⚠️  连接服务器失败: ${error.message}`);
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

      // 停止预测服务
      if (this.predictionService) {
        try {
          this.predictionService.stopAll();
        } catch (error) {
          console.error(`  ⚠️  停止预测服务失败:`, error.message);
        }
      }

      // 清理所有子服务的事件监听器，防止内存泄漏
      if (this.rustPlusService) {
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
      if (this.predictionService) {
        this.predictionService.removeAllListeners();
      }

      console.log(`  ✅ 子服务已停止`);
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
    const predictionStatus = this.predictionService ? {
      activeTimers: this.predictionService.notificationTimers.size
    } : null;

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
        prediction: !!this.predictionService
      },
      rustPlusStats,
      fcmStatus,
      eventMonitorStatus,
      automationStatus,
      predictionStatus
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
      const existingServers = await prisma.servers.findMany({
        where: {
          userId: this.userId,
          ip: { not: '0.0.0.0' },
          NOT: { id: { startsWith: 'fcm-' } }
        }
      });

      // 2. 检查是否是同一服务器的更新（IP:Port 相同）
      const isSameServer = existingServers.some(
        s => s.ip === data.ip && s.port === String(data.port)
      );

      // 3. 如果已有不同服务器，需要用户确认替换
      if (existingServers.length > 0 && !isSameServer) {
        const oldServer = existingServers[0];

        this.log('PAIRING', `检测到需要替换服务器: ${oldServer.name} -> ${data.name}`);

        // 暂存新服务器数据
        this.pendingServerPairing = {
          newServer: data,
          oldServer: {
            id: oldServer.id,
            name: oldServer.name,
            ip: oldServer.ip,
            port: oldServer.port
          },
          timestamp: Date.now()
        };

        // 发送确认请求到前端
        this.emit('server:replace:confirm', {
          userId: this.userId,
          oldServer: {
            id: oldServer.id,
            name: oldServer.name,
            ip: oldServer.ip,
            port: oldServer.port
          },
          newServer: {
            name: data.name,
            ip: data.ip,
            port: data.port
          }
        });

        return; // 等待用户确认
      }

      // 4. 无需确认，直接执行配对
      await this._executeServerPairing(data);

    } catch (error) {
      this.log('PAIRING', `配对处理失败: ${error.message}`, 'ERROR');
      console.error(error);
    }
  }

  /**
   * 处理用户确认替换的响应
   * @param {boolean} confirmed - 用户是否确认替换
   */
  async handleServerReplaceResponse(confirmed) {
    if (!this.pendingServerPairing) {
      this.log('PAIRING', '没有待确认的配对请求', 'WARN');
      return;
    }

    const { newServer, oldServer, timestamp } = this.pendingServerPairing;

    // 检查是否超时（5分钟）
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      this.log('PAIRING', '配对确认已超时', 'WARN');
      this.pendingServerPairing = null;
      return;
    }

    if (!confirmed) {
      this.log('PAIRING', `用户取消了服务器替换: ${newServer.name}`);
      this.pendingServerPairing = null;
      return;
    }

    try {
      this.log('PAIRING', `用户确认替换服务器: ${oldServer.name} -> ${newServer.name}`);

      // 1. 断开旧服务器连接
      if (this.rustPlusService.isConnected(oldServer.id)) {
        await this.rustPlusService.disconnect(oldServer.id);
      }

      // 2. 停止旧服务器的相关服务
      this.eventMonitorService.stop(oldServer.id);
      this.automationService.stop(oldServer.id);
      this.dayNightNotifier.stop(oldServer.id);
      this.predictionService.stop(oldServer.id);

      // 3. 删除旧服务器（会级联删除 devices 和 event_logs）
      await prisma.servers.delete({
        where: { id: oldServer.id }
      });
      this.log('PAIRING', `已删除旧服务器: ${oldServer.name}`);

      // 4. 执行新服务器配对
      await this._executeServerPairing(newServer);

    } catch (error) {
      this.log('PAIRING', `替换服务器失败: ${error.message}`, 'ERROR');
      console.error(error);
    } finally {
      this.pendingServerPairing = null;
    }
  }

  /**
   * 执行实际的服务器配对逻辑
   * @private
   */
  async _executeServerPairing(data) {
    // 生成用户专属的服务器 ID（防止不同用户配对同一服务器时 ID 冲突）
    const userServerId = `${this.userId}_${data.id}`;

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
    const existing = await prisma.servers.findFirst({
      where: {
        userId: this.userId,
        ip: data.ip,
        port: String(data.port)
      }
    });

    if (existing) {
      await prisma.servers.update({
        where: { id: existing.id },
        data: serverData
      });
      this.log('PAIRING', `更新已存在的服务器信息: ${data.name}`);
    } else {
      await prisma.servers.create({
        data: serverData
      });
      this.log('PAIRING', `保存新服务器信息: ${data.name}`);
    }

    // 2. 更新内存中的用户数据
    await this._loadUserData();

    // 3. 如果已有连接，先断开
    if (this.rustPlusService.connections.has(userServerId)) {
      this.log('PAIRING', `断开旧连接...`);
      await this.rustPlusService.disconnect(userServerId);
    }

    // 4. 发起新连接
    this.log('PAIRING', `正在连接到新服务器...`);
    await this.rustPlusService.connect({
      serverId: userServerId,
      ip: data.ip,
      port: data.port,
      playerId: data.playerId,
      playerToken: data.playerToken
    });

    // 5. 启动相关子服务
    this.log('PAIRING', `正在启动实时监控与自动化服务...`);
    try {
      await this.eventMonitorService.start(userServerId);
      await this.automationService.start(userServerId);
      await this.dayNightNotifier.start(userServerId);
      await this.predictionService.start(userServerId);
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
      if (!data.entityId || !data.serverId) {
        this.log('ENTITY_PAIRING', `设备配对数据不完整: entityId=${data.entityId}, serverId=${data.serverId}`, 'WARN');
        return;
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
      const existing = await prisma.devices.findFirst({
        where: {
          serverId: data.serverId,
          entityId: entityId
        }
      });

      if (existing) {
        // 更新已存在的设备
        await prisma.devices.update({
          where: { id: existing.id },
          data: {
            name: deviceData.name,
            type: deviceType,
            isActive: true,
            reachable: true,
            updatedAt: new Date()
          }
        });
        this.log('ENTITY_PAIRING', `更新已存在的设备: ${deviceData.name} (${deviceType})`);
      } else {
        // 创建新设备
        await prisma.devices.create({
          data: deviceData
        });
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
      const device = await prisma.devices.findFirst({
        where: {
          serverId: serverId,
          entityId: parseInt(entityId)
        }
      });

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
      await prisma.devices.update({
        where: { id: device.id },
        data: { lastTrigger: new Date(time), updatedAt: new Date() }
      });

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
