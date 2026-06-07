/**
 * GlobalServiceManager - 全局服务管理器
 * 负责管理所有用户的服务实例
 */

import { EventEmitter } from 'events';
import db from '../lib/db.js';
import UserServiceManager from './user-service-manager.js';
import notificationService from './notification.service.js';

class GlobalServiceManager extends EventEmitter {
  constructor() {
    super();

    // 存储所有用户的服务实例 Map<userId, UserServiceManager>
    this.userServices = new Map();

    // 创建中的用户（userId -> 创建 Promise），防止并发重复创建产生双实例/资源泄漏
    this.creatingUsers = new Map();

    // 订阅检查定时器
    this.subscriptionCheckTimer = null;

    // 检查间隔（1 小时）
    this.CHECK_INTERVAL = 60 * 60 * 1000;

    // 队伍信息缓存（同队伍用户共享）
    // 结构: Map<serverKey, { teamInfo, memberSteamIds: Set, timestamp }>
    // serverKey = `${ip}:${port}`
    this.teamInfoCache = new Map();
    this.TEAM_CACHE_TTL = 5000; // 缓存有效期 5 秒

    console.log('🌐 GlobalServiceManager 已创建');
  }

  // ========== 队伍信息缓存方法 ==========

  /**
   * 获取缓存的队伍信息（如果同队伍）
   * @param {string} ip - 服务器 IP
   * @param {string} port - 服务器端口
   * @param {string} playerId - 当前用户的 Steam ID
   * @returns {object|null} - 缓存的 teamInfo 或 null
   */
  getCachedTeamInfo(ip, port, playerId) {
    const serverKey = `${ip}:${port}`;
    const cached = this.teamInfoCache.get(serverKey);

    if (!cached) return null;

    // 检查缓存是否过期
    if (Date.now() - cached.timestamp > this.TEAM_CACHE_TTL) {
      this.teamInfoCache.delete(serverKey);
      return null;
    }

    // 检查当前用户是否在缓存的队伍中
    if (cached.memberSteamIds.has(playerId)) {
      return cached.teamInfo;
    }

    return null;
  }

  /**
   * 设置队伍信息缓存
   * @param {string} ip - 服务器 IP
   * @param {string} port - 服务器端口
   * @param {object} teamInfo - 队伍信息
   */
  setCachedTeamInfo(ip, port, teamInfo) {
    if (!teamInfo || !teamInfo.members) return;

    const serverKey = `${ip}:${port}`;
    const memberSteamIds = new Set(
      teamInfo.members.map(m => m.steamId?.toString()).filter(Boolean)
    );

    this.teamInfoCache.set(serverKey, {
      teamInfo,
      memberSteamIds,
      timestamp: Date.now()
    });
  }

  /**
   * 清理过期的队伍缓存
   */
  cleanExpiredTeamCache() {
    const now = Date.now();
    for (const [key, cached] of this.teamInfoCache.entries()) {
      if (now - cached.timestamp > this.TEAM_CACHE_TTL) {
        this.teamInfoCache.delete(key);
      }
    }
  }

  /**
   * 初始化所有有效用户的服务实例
   * 在应用启动时调用
   */
  async initializeAllActiveUsers() {
    try {
      console.log('\n🚀 开始初始化所有有效用户的服务...\n');

      // 查询所有活跃且订阅未过期的用户
      const [activeUsers] = await db.query(
        `SELECT u.*, s.endDate as subscriptionEndDate
         FROM users u
         INNER JOIN subscriptions s ON u.id = s.userId
         WHERE u.isActive = 1 AND s.endDate > NOW()`
      );

      console.log(`📊 找到 ${activeUsers.length} 个有效用户\n`);

      // 为每个用户创建服务实例
      let successCount = 0;
      let failCount = 0;

      for (const user of activeUsers) {
        try {
          await this.createUserService(user.id);
          successCount++;

          const daysLeft = Math.ceil(
            (new Date(user.subscriptionEndDate) - new Date()) / (1000 * 60 * 60 * 24)
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
    // 已存在直接返回
    if (this.userServices.has(userId)) {
      console.log(`⚠️  用户 ${userId} 的服务实例已存在`);
      return this.userServices.get(userId);
    }

    // 创建中去重：并发调用复用同一个创建 Promise，避免双实例（监听器/定时器/FCM 连接泄漏 + 重复连服务器）
    if (this.creatingUsers.has(userId)) {
      return this.creatingUsers.get(userId);
    }

    const creationPromise = this._createUserServiceInternal(userId);
    this.creatingUsers.set(userId, creationPromise);
    try {
      return await creationPromise;
    } finally {
      this.creatingUsers.delete(userId);
    }
  }

  /**
   * 实际创建用户服务实例（受 createUserService 的并发去重保护）
   * @param {string} userId - 用户 ID
   * @returns {Promise<UserServiceManager>}
   * @private
   */
  async _createUserServiceInternal(userId) {
    try {
      // 验证用户存在且订阅有效
      const [userRows] = await db.query(
        `SELECT u.*, s.endDate as subscriptionEndDate
         FROM users u
         LEFT JOIN subscriptions s ON u.id = s.userId
         WHERE u.id = ?`,
        [userId]
      );

      const user = userRows[0];

      if (!user) {
        throw new Error('用户不存在');
      }

      if (!user.isActive) {
        throw new Error('用户已被禁用');
      }

      if (!user.subscriptionEndDate || new Date() > new Date(user.subscriptionEndDate)) {
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

      // 解绑 GlobalServiceManager 注册在该实例上的全部监听器，防止“销毁→重建”时累积泄漏
      userService.removeAllListeners();

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

      // 创建 keys 快照，防止迭代期间 Map 被修改
      const userIds = Array.from(this.userServices.keys());

      // 遍历所有活跃用户
      for (const userId of userIds) {
        try {
          const [userRows] = await db.query(
            `SELECT u.*, s.endDate as subscriptionEndDate
             FROM users u
             LEFT JOIN subscriptions s ON u.id = s.userId
             WHERE u.id = ?`,
            [userId]
          );

          const user = userRows[0];

          // 检查用户是否仍然有效
          if (!user || !user.isActive || !user.subscriptionEndDate) {
            await this.removeUserService(userId, '用户无效或无订阅');
            expiredCount++;
            continue;
          }

          // 检查订阅是否过期
          if (now > new Date(user.subscriptionEndDate)) {
            console.log(`  📅 用户 ${user.username} 的订阅已过期`);
            await this.removeUserService(userId, '订阅已过期');
            expiredCount++;
            continue;
          }

          // 如果订阅即将在 3 天内过期，发出警告
          const daysLeft = Math.ceil(
            (new Date(user.subscriptionEndDate) - now) / (1000 * 60 * 60 * 24)
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
    // 统一向上转发：强制注入 userId，确保 WebSocketService 能按 user:${userId} 房间定向。
    // 任何用户级推送都必须带 userId，否则会被发到 user:undefined 房间，前端永远收不到。
    const withUserId = (data) => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return { ...data, userId };
      }
      return { userId, data };
    };
    const forward = (event, targetEvent = event) => {
      userService.on(event, (data) => {
        this.emit(targetEvent, withUserId(data));
      });
    };

    // === 生命周期事件（上抛时重命名为 user:*）===
    forward('initialized', 'user:initialized');

    userService.on('shutdown', (data) => {
      console.log(`🛑 用户 ${userId} 服务已停止`);
      this.emit('user:shutdown', withUserId(data));
    });

    userService.on('error', (error) => {
      console.error(`❌ 用户 ${userId} 服务错误:`, error?.message || error);
      this.emit('user:service:error', { userId, error });
    });

    // === RustPlus 游戏服务器事件 ===
    forward('server:connected');
    forward('server:disconnected');
    forward('server:error');
    forward('server:reconnecting');
    forward('rust:message');
    forward('team:message');
    forward('team:changed');
    forward('entity:changed');
    forward('clan:changed');
    forward('clan:message');

    // === 警报事件（额外触发外部强提醒）===
    userService.on('alarm:triggered', (data) => {
      const payload = withUserId(data);
      this.emit('alarm:triggered', payload);
      // 外部强提醒（Bark 等），失败不阻塞主流程
      notificationService.notifyAlarm(payload).catch((err) => {
        console.error('❌ 警报外部通知失败:', err.message);
      });
    });

    // === 摄像头事件 ===
    forward('camera:subscribing');
    forward('camera:subscribed');
    forward('camera:unsubscribed');
    forward('camera:render');
    forward('camera:rays');

    // === FCM 推送事件 ===
    forward('server:paired');
    forward('entity:paired');
    forward('entity:paired:success');
    forward('fcm:listening');
    forward('fcm:stopped');
    forward('fcm:error');

    // === EventMonitor 事件监控 ===
    forward('cargo:spawn');
    forward('cargo:egress');
    forward('cargo:dock');
    forward('cargo:leave');
    forward('travelling_vendor:spawn');
    forward('travelling_vendor:leave_warning');
    forward('travelling_vendor:leave');
    forward('heli:spawn');
    forward('heli:downed');
    forward('heli:leave');
    forward('player:died');
    forward('player:online');
    forward('player:offline');
    forward('player:afk');
    forward('player:contribution');

    // === Automation 自动化 ===
    forward('automation:executed');

    // === Tracking 玩家追踪 ===
    forward('tracking:online');
    forward('tracking:offline');
    forward('tracking:server_change');
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

}

// 导出单例
export default new GlobalServiceManager();
