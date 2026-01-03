/**
 * UserServiceManager - 用户服务管理器
 * 每个用户一个实例，管理该用户的所有服务
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';

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

    // 各个服务实例（后续实现）
    this.rustPlusService = null;
    this.fcmService = null;
    this.eventMonitorService = null;
    this.automationService = null;
    this.commandsService = null;
    this.dayNightNotifier = null;

    console.log(`👤 UserServiceManager 已创建 (userId: ${userId})`);
  }

  /**
   * 初始化用户服务
   * 加载用户数据并启动所有子服务
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.log(`⚠️  用户 ${this.userId} 的服务已初始化`);
        return;
      }

      console.log(`🚀 初始化用户 ${this.userId} 的服务...`);

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
      this.user = await prisma.user.findUnique({
        where: { id: this.userId },
        include: {
          subscription: true,
          servers: {
            include: {
              devices: true
            }
          },
          notificationSettings: true
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

      // TODO: 这里将初始化各个服务实例
      // this.rustPlusService = new RustPlusService(this.userId);
      // this.fcmService = new FCMService(this.userId);
      // this.eventMonitorService = new EventMonitorService(this.userId);
      // this.automationService = new AutomationService(this.userId);
      // this.commandsService = new CommandsService(this.userId);
      // this.dayNightNotifier = new DayNightNotifier(this.userId);

      console.log(`  ✅ 子服务初始化完成（占位符）`);
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

      // TODO: 这里将连接到用户的所有服务器
      // for (const server of this.user.servers) {
      //   await this.rustPlusService.connect(server);
      // }

      console.log(`  ✅ 服务器连接完成（占位符）`);
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

      // TODO: 这里将断开所有服务器连接
      // if (this.rustPlusService) {
      //   await this.rustPlusService.disconnectAll();
      // }

      console.log(`  ✅ 服务器已断开（占位符）`);
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

      // TODO: 这里将停止所有子服务
      // if (this.fcmService) await this.fcmService.stop();
      // if (this.eventMonitorService) await this.eventMonitorService.stop();
      // if (this.automationService) await this.automationService.stop();
      // if (this.commandsService) await this.commandsService.stop();
      // if (this.dayNightNotifier) await this.dayNightNotifier.stop();

      console.log(`  ✅ 子服务已停止（占位符）`);
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
      subscription: this.user.subscription
    } : null;
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      userId: this.userId,
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      serverCount: this.user?.servers?.length || 0,
      services: {
        rustPlus: !!this.rustPlusService,
        fcm: !!this.fcmService,
        eventMonitor: !!this.eventMonitorService,
        automation: !!this.automationService,
        commands: !!this.commandsService,
        dayNight: !!this.dayNightNotifier
      }
    };
  }
}

export default UserServiceManager;
