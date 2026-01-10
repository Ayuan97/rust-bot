/**
 * GlobalServiceManager - 全局服务管理器
 * 负责管理所有用户的服务实例
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import UserServiceManager from './user-service-manager.js';

const prisma = new PrismaClient();

class GlobalServiceManager extends EventEmitter {
  constructor() {
    super();

    // 存储所有用户的服务实例 Map<userId, UserServiceManager>
    this.userServices = new Map();

    // 订阅检查定时器
    this.subscriptionCheckTimer = null;

    // 检查间隔（1 小时）
    this.CHECK_INTERVAL = 60 * 60 * 1000;

    console.log('🌐 GlobalServiceManager 已创建');
  }

  /**
   * 初始化所有有效用户的服务实例
   * 在应用启动时调用
   */
  async initializeAllActiveUsers() {
    try {
      console.log('\n🚀 开始初始化所有有效用户的服务...\n');

      // 查询所有活跃且订阅未过期的用户
      const activeUsers = await prisma.users.findMany({
        where: {
          isActive: true,
          subscriptions: {
            endDate: {
              gt: new Date() // 订阅未过期
            }
          }
        },
        include: {
          subscriptions: true
        }
      });

      console.log(`📊 找到 ${activeUsers.length} 个有效用户\n`);

      // 为每个用户创建服务实例
      let successCount = 0;
      let failCount = 0;

      for (const user of activeUsers) {
        try {
          await this.createUserService(user.id);
          successCount++;

          const daysLeft = Math.ceil(
            (user.subscriptions.endDate - new Date()) / (1000 * 60 * 60 * 24)
          );
          console.log(`  ✅ ${user.username} (订阅剩余 ${daysLeft} 天)`);
        } catch (error) {
          failCount++;
          console.error(`  ❌ ${user.username}: ${error.message}`);
        }
      }

      console.log(`\n📈 初始化完成: ${successCount} 成功, ${failCount} 失败\n`);

      // 启动订阅检查定时器
      this.startSubscriptionCheck();

      this.emit('initialized', {
        total: activeUsers.length,
        success: successCount,
        failed: failCount
      });

      return { success: successCount, failed: failCount };
    } catch (error) {
      console.error('❌ 初始化用户服务失败:', error);
      throw error;
    }
  }

  /**
   * 为指定用户创建服务实例
   * @param {string} userId - 用户 ID
   * @returns {Promise<UserServiceManager>} 用户服务实例
   */
  async createUserService(userId) {
    try {
      // 检查是否已存在
      if (this.userServices.has(userId)) {
        console.log(`⚠️  用户 ${userId} 的服务实例已存在`);
        return this.userServices.get(userId);
      }

      // 验证用户存在且订阅有效
      const user = await prisma.users.findUnique({
        where: { id: userId },
        include: { subscriptions: true }
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (!user.isActive) {
        throw new Error('用户已被禁用');
      }

      if (!user.subscriptions || new Date() > user.subscriptions.endDate) {
        throw new Error('用户订阅已过期');
      }

      // 创建用户服务实例
      const userService = new UserServiceManager(userId);

      // 初始化服务
      await userService.initialize();

      // 存储实例
      this.userServices.set(userId, userService);

      // 监听用户服务事件
      this._attachUserServiceListeners(userId, userService);

      console.log(`✅ 用户 ${user.username} 的服务实例已创建`);

      this.emit('user:service:created', { userId, username: user.username });

      return userService;
    } catch (error) {
      console.error(`❌ 创建用户 ${userId} 的服务实例失败:`, error.message);
      throw error;
    }
  }

  /**
   * 删除用户服务实例
   * @param {string} userId - 用户 ID
   * @param {string} reason - 删除原因
   */
  async removeUserService(userId, reason = '手动删除') {
    try {
      const userService = this.userServices.get(userId);

      if (!userService) {
        console.log(`⚠️  用户 ${userId} 的服务实例不存在`);
        return;
      }

      console.log(`🗑️  删除用户 ${userId} 的服务实例 (原因: ${reason})`);

      // 停止用户服务
      await userService.shutdown();

      // 从 Map 中移除
      this.userServices.delete(userId);

      this.emit('user:service:removed', { userId, reason });

      console.log(`✅ 用户 ${userId} 的服务实例已删除`);
    } catch (error) {
      console.error(`❌ 删除用户 ${userId} 的服务实例失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取用户服务实例
   * @param {string} userId - 用户 ID
   * @returns {UserServiceManager|null} 用户服务实例
   */
  getUserService(userId) {
    return this.userServices.get(userId) || null;
  }

  /**
   * 获取所有活跃用户的 ID 列表
   * @returns {string[]} 用户 ID 数组
   */
  getActiveUserIds() {
    return Array.from(this.userServices.keys());
  }

  /**
   * 获取活跃用户数量
   * @returns {number} 用户数量
   */
  getActiveUserCount() {
    return this.userServices.size;
  }

  /**
   * 启动订阅检查定时器
   * 每小时检查一次所有用户的订阅状态
   */
  startSubscriptionCheck() {
    // 清除现有定时器
    if (this.subscriptionCheckTimer) {
      clearInterval(this.subscriptionCheckTimer);
    }

    console.log('⏰ 启动订阅检查定时器（每小时检查一次）');

    // 设置定时器
    this.subscriptionCheckTimer = setInterval(
      () => this.checkExpiredSubscriptions(),
      this.CHECK_INTERVAL
    );

    // 立即执行一次检查
    this.checkExpiredSubscriptions();
  }

  /**
   * 停止订阅检查定时器
   */
  stopSubscriptionCheck() {
    if (this.subscriptionCheckTimer) {
      clearInterval(this.subscriptionCheckTimer);
      this.subscriptionCheckTimer = null;
      console.log('⏰ 订阅检查定时器已停止');
    }
  }

  /**
   * 检查过期订阅
   * 清理已过期用户的服务实例
   */
  async checkExpiredSubscriptions() {
    try {
      console.log('\n⏰ 开始检查订阅过期...');

      const now = new Date();
      let expiredCount = 0;

      // 遍历所有活跃用户
      for (const userId of this.userServices.keys()) {
        try {
          const user = await prisma.users.findUnique({
            where: { id: userId },
            include: { subscriptions: true }
          });

          // 检查用户是否仍然有效
          if (!user || !user.isActive || !user.subscriptions) {
            await this.removeUserService(userId, '用户无效或无订阅');
            expiredCount++;
            continue;
          }

          // 检查订阅是否过期
          if (now > user.subscriptions.endDate) {
            console.log(`  📅 用户 ${user.username} 的订阅已过期`);
            await this.removeUserService(userId, '订阅已过期');
            expiredCount++;
            continue;
          }

          // 如果订阅即将在 3 天内过期，发出警告
          const daysLeft = Math.ceil(
            (user.subscriptions.endDate - now) / (1000 * 60 * 60 * 24)
          );
          if (daysLeft <= 3) {
            console.log(`  ⚠️  用户 ${user.username} 的订阅将在 ${daysLeft} 天后过期`);
            this.emit('subscriptions:expiring:soon', {
              userId,
              username: user.username,
              daysLeft
            });
          }
        } catch (error) {
          console.error(`  ❌ 检查用户 ${userId} 失败:`, error.message);
        }
      }

      if (expiredCount > 0) {
        console.log(`📊 清理了 ${expiredCount} 个过期订阅`);
      } else {
        console.log('✅ 没有过期订阅');
      }

      console.log(`📊 当前活跃用户: ${this.userServices.size}\n`);

      this.emit('subscriptions:checked', {
        total: this.userServices.size,
        expired: expiredCount
      });
    } catch (error) {
      console.error('❌ 检查订阅失败:', error);
    }
  }

  /**
   * 绑定用户服务事件监听器
   * 转发所有事件到 GlobalServiceManager，供 WebSocketService 监听
   * @private
   */
  _attachUserServiceListeners(userId, userService) {
    // 监听初始化事件
    userService.on('initialized', (data) => {
      this.emit('user:initialized', { ...data, userId });
    });

    // 监听关闭事件
    userService.on('shutdown', (data) => {
      console.log(`🛑 用户 ${userId} 服务已停止`);
      this.emit('user:shutdown', { ...data, userId });
    });

    // 监听错误事件
    userService.on('error', (error) => {
      console.error(`❌ 用户 ${userId} 服务错误:`, error.message);
      this.emit('user:service:error', { userId, error });
    });

    // === RustPlus 游戏服务器事件 ===

    userService.on('server:connected', (data) => {
      this.emit('server:connected', data); // data 已包含 userId
    });

    userService.on('server:disconnected', (data) => {
      this.emit('server:disconnected', data);
    });

    userService.on('server:error', (data) => {
      this.emit('server:error', data);
    });

    userService.on('server:reconnecting', (data) => {
      this.emit('server:reconnecting', data);
    });

    userService.on('rust:message', (data) => {
      this.emit('rust:message', data);
    });

    userService.on('team:message', (data) => {
      this.emit('team:message', data);
    });

    userService.on('team:changed', (data) => {
      this.emit('team:changed', data);
    });

    userService.on('entity:changed', (data) => {
      this.emit('entity:changed', data);
    });

    userService.on('alarm:triggered', (data) => {
      this.emit('alarm:triggered', data);
    });

    userService.on('clan:changed', (data) => {
      this.emit('clan:changed', data);
    });

    userService.on('clan:message', (data) => {
      this.emit('clan:message', data);
    });

    // === 摄像头事件 ===

    userService.on('camera:subscribing', (data) => {
      this.emit('camera:subscribing', data);
    });

    userService.on('camera:subscribed', (data) => {
      this.emit('camera:subscribed', data);
    });

    userService.on('camera:unsubscribed', (data) => {
      this.emit('camera:unsubscribed', data);
    });

    userService.on('camera:render', (data) => {
      this.emit('camera:render', data);
    });

    userService.on('camera:rays', (data) => {
      this.emit('camera:rays', data);
    });

    // === FCM 推送事件 ===

    userService.on('server:paired', (data) => {
      this.emit('server:paired', data);
    });

    userService.on('entity:paired', (data) => {
      this.emit('entity:paired', data);
    });

    userService.on('fcm:listening', (data) => {
      this.emit('fcm:listening', data);
    });

    userService.on('fcm:stopped', (data) => {
      this.emit('fcm:stopped', data);
    });

    userService.on('fcm:error', (data) => {
      this.emit('fcm:error', data);
    });

    // === EventMonitor 事件监控事件 ===

    userService.on('cargo:spawn', (data) => {
      this.emit('cargo:spawn', data);
    });

    userService.on('cargo:egress', (data) => {
      this.emit('cargo:egress', data);
    });

    userService.on('cargo:dock', (data) => {
      this.emit('cargo:dock', data);
    });

    userService.on('cargo:leave', (data) => {
      this.emit('cargo:leave', data);
    });

    userService.on('heli:spawn', (data) => {
      this.emit('heli:spawn', data);
    });

    userService.on('heli:downed', (data) => {
      this.emit('heli:downed', data);
    });

    userService.on('heli:leave', (data) => {
      this.emit('heli:leave', data);
    });

    userService.on('player:died', (data) => {
      this.emit('player:died', data);
    });

    userService.on('player:online', (data) => {
      this.emit('player:online', data);
    });

    userService.on('player:offline', (data) => {
      this.emit('player:offline', data);
    });

    userService.on('player:afk', (data) => {
      this.emit('player:afk', data);
    });

    // === Automation 自动化事件 ===

    userService.on('automation:executed', (data) => {
      this.emit('automation:executed', data);
    });
  }

  /**
   * 停止所有用户服务
   * 在应用关闭时调用
   */
  async shutdownAll() {
    try {
      console.log('\n🛑 开始停止所有用户服务...\n');

      // 停止订阅检查
      this.stopSubscriptionCheck();

      const userIds = Array.from(this.userServices.keys());
      let count = 0;

      for (const userId of userIds) {
        try {
          await this.removeUserService(userId, '应用关闭');
          count++;
        } catch (error) {
          console.error(`  ❌ 停止用户 ${userId} 服务失败:`, error.message);
        }
      }

      console.log(`\n✅ 已停止 ${count} 个用户服务\n`);

      this.emit('shutdown:complete', { count });
    } catch (error) {
      console.error('❌ 停止所有用户服务失败:', error);
      throw error;
    }
  }

  /**
   * 为所有活跃用户刷新代理配置
   * 当全局代理启动、停止或切换节点时调用
   */
  async refreshAllUserProxySettings() {
    console.log('\n🌐 正在为所有活跃用户同步代理配置...');
    const proxyService = (await import('./proxy.service.js')).default;
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const proxyConfig = await prisma.proxy_config.findUnique({ where: { id: 1 } });
    const isRunning = proxyService.isRunning;
    const proxyAgent = isRunning ? proxyService.getProxyAgent() : null;
    const socksConfig = isRunning ? { host: '127.0.0.1', port: proxyConfig?.proxyPort || 10808 } : null;

    let count = 0;
    for (const userService of this.userServices.values()) {
      userService.rustPlusService.setProxyConfig(socksConfig);
      userService.fcmService.setProxyConfig(socksConfig);
      userService.fcmService.setProxyAgent(proxyAgent);
      count++;
    }
    console.log(`✅ 已同步代理配置到 ${count} 个用户实例\n`);
  }
}

// 导出单例
export default new GlobalServiceManager();
