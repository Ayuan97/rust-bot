/**
 * UserServiceManager - 用户服务管理器
 * 每个用户一个实例，管理该用户的所有服务
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import UserRustPlusManager from './user-rustplus-manager.js';
import UserFCMManager from './user-fcm-manager.js';
import UserEventMonitor from './user-event-monitor.js';
import UserAutomation from './user-automation.js';
import UserCommands from './user-commands.js';

const prisma = new PrismaClient();

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
    this.dayNightNotifier = null;     // 昼夜提醒（待实现）

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
            console.error(`  ⚠️  命令处理失败:`, error.message);
          });
        }
      });

      this.rustPlusService.on('team:changed', (data) => {
        this.emit('team:changed', data);
      });

      this.rustPlusService.on('entity:changed', (data) => {
        this.emit('entity:changed', data);
      });

      this.rustPlusService.on('alarm:triggered', (data) => {
        this.emit('alarm:triggered', data);
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
      this.fcmService.on('server:paired', (data) => {
        console.log(`  🎮 收到服务器配对推送: ${data.name}`);
        this.emit('server:paired', data);
      });

      this.fcmService.on('entity:paired', (data) => {
        console.log(`  🔌 收到设备配对推送`);
        this.emit('entity:paired', data);
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
        this.emit('player:died', data);
      });

      this.eventMonitorService.on('player:online', (data) => {
        this.emit('player:online', data);
      });

      this.eventMonitorService.on('player:offline', (data) => {
        this.emit('player:offline', data);
      });

      this.eventMonitorService.on('player:afk', (data) => {
        this.emit('player:afk', data);
      });

      // 5. 绑定 Automation 事件到 UserServiceManager
      this.automationService.on('automation:executed', (data) => {
        this.emit('automation:executed', data);
      });

      // 6. TODO: 初始化其他服务
      // this.commandsService = new UserCommandsService(this.userId, this.rustPlusService);
      // this.dayNightNotifier = new UserDayNightNotifier(this.userId, this.rustPlusService);

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

      // TODO: 停止其他子服务
      // if (this.commandsService) await this.commandsService.stop();
      // if (this.dayNightNotifier) await this.dayNightNotifier.stop();

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
        dayNight: !!this.dayNightNotifier
      },
      rustPlusStats,
      fcmStatus,
      eventMonitorStatus,
      automationStatus
    };
  }
}

export default UserServiceManager;
