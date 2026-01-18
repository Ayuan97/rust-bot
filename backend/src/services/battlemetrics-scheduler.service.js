/**
 * BattlemetricsScheduler - Battlemetrics 数据定时更新服务
 *
 * 功能：
 * - 监控所有用户在线连接的服务器
 * - 定时从 Battlemetrics API 获取服务器信息
 * - 将数据存储到 public_servers 表（公共缓存）
 * - 多个用户连接同一服务器时，只请求一次 API
 */

import EventEmitter from 'events';
import prisma from '../lib/prisma.js';
import battlemetricsService from './battlemetrics.service.js';
import logger from '../utils/logger.js';

class BattlemetricsScheduler extends EventEmitter {
  constructor() {
    super();

    // 全局服务管理器引用（启动时注入）
    this.globalServiceManager = null;

    // 更新间隔（毫秒）
    this.updateInterval = 30 * 1000; // 30 秒

    // 请求间隔（毫秒）- 控制 API 调用频率
    this.requestDelay = 200; // 200ms = 5 请求/秒

    // 定时器
    this.timer = null;

    // 运行状态
    this.isRunning = false;
    this.isUpdating = false;

    // 统计信息
    this.stats = {
      lastUpdateTime: null,
      lastUpdateCount: 0,
      totalUpdates: 0,
      errors: 0
    };

    logger.info('📊 BattlemetricsScheduler 已创建');
  }

  /**
   * 设置全局服务管理器引用
   */
  setGlobalServiceManager(manager) {
    this.globalServiceManager = manager;
    logger.info('📊 BattlemetricsScheduler 已关联 GlobalServiceManager');
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️  BattlemetricsScheduler 已经在运行');
      return;
    }

    if (!this.globalServiceManager) {
      logger.error('❌ BattlemetricsScheduler 未关联 GlobalServiceManager');
      return;
    }

    this.isRunning = true;
    logger.info(`📊 BattlemetricsScheduler 已启动 (更新间隔: ${this.updateInterval / 1000}秒)`);

    // 立即执行一次
    this.update();

    // 设置定时器
    this.timer = setInterval(() => {
      this.update();
    }, this.updateInterval);
  }

  /**
   * 停止调度器
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    logger.info('📊 BattlemetricsScheduler 已停止');
  }

  /**
   * 获取所有在线服务器的 battlemetricsId
   * @returns {Promise<Map<string, {serverId: string, ip: string, port: string, name: string}>>}
   */
  async getActiveServerIds() {
    const serverMap = new Map(); // battlemetricsId -> serverInfo

    if (!this.globalServiceManager) {
      return serverMap;
    }

    // 遍历所有用户服务
    for (const [userId, userService] of this.globalServiceManager.userServices) {
      try {
        const rustPlusService = userService.rustPlusService;
        if (!rustPlusService) continue;

        // 获取该用户连接的所有服务器
        const connectedServerIds = rustPlusService.getConnectedServers();

        for (const serverId of connectedServerIds) {
          // 从数据库获取服务器信息
          const server = await prisma.servers.findFirst({
            where: { id: serverId },
            select: {
              id: true,
              battlemetricsId: true,
              ip: true,
              port: true,
              name: true
            }
          });

          if (server?.battlemetricsId) {
            // 使用 Map 自动去重
            if (!serverMap.has(server.battlemetricsId)) {
              serverMap.set(server.battlemetricsId, {
                serverId: server.id,
                ip: server.ip,
                port: server.port,
                name: server.name
              });
            }
          }
        }
      } catch (error) {
        logger.error(`获取用户 ${userId} 的服务器列表失败:`, error.message);
      }
    }

    return serverMap;
  }

  /**
   * 执行更新
   */
  async update() {
    // 防止重复执行
    if (this.isUpdating) {
      logger.debug('📊 上一次更新尚未完成，跳过本次');
      return;
    }

    this.isUpdating = true;

    try {
      // 获取所有在线服务器
      const serverMap = await this.getActiveServerIds();

      if (serverMap.size === 0) {
        logger.debug('📊 没有在线服务器需要更新');
        this.isUpdating = false;
        return;
      }

      logger.info(`📊 开始更新 ${serverMap.size} 个在线服务器的 Battlemetrics 数据`);

      let successCount = 0;
      let errorCount = 0;

      // 遍历并更新每个服务器
      for (const [bmId, serverInfo] of serverMap) {
        try {
          await this.syncServer(bmId, serverInfo);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error(`更新服务器 ${bmId} 失败:`, error.message);
        }

        // 请求间隔，避免超过速率限制
        await this.sleep(this.requestDelay);
      }

      // 更新统计
      this.stats.lastUpdateTime = new Date();
      this.stats.lastUpdateCount = serverMap.size;
      this.stats.totalUpdates += successCount;
      this.stats.errors += errorCount;

      logger.info(`📊 Battlemetrics 更新完成: ${successCount} 成功, ${errorCount} 失败`);

      this.emit('update:complete', {
        total: serverMap.size,
        success: successCount,
        errors: errorCount
      });

    } catch (error) {
      logger.error('📊 Battlemetrics 更新失败:', error.message);
      this.stats.errors++;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * 同步单个服务器
   * @param {string} bmId - Battlemetrics ID
   * @param {object} serverInfo - 服务器信息
   */
  async syncServer(bmId, serverInfo = {}) {
    // 从 Battlemetrics API 获取数据
    const bmData = await battlemetricsService.getServerInfo(bmId);

    if (!bmData) {
      throw new Error('Battlemetrics API 返回空数据');
    }

    // 更新或创建 public_servers 记录
    await prisma.public_servers.upsert({
      where: { battlemetricsId: bmId },
      create: this.mapToDbRecord(bmId, bmData),
      update: this.mapToDbRecord(bmId, bmData)
    });

    logger.debug(`📊 已更新服务器: ${bmData.name || bmId}`);
  }

  /**
   * 将 Battlemetrics 数据映射为数据库记录
   */
  mapToDbRecord(bmId, data) {
    return {
      battlemetricsId: bmId,
      name: data.name || 'Unknown',
      ip: data.ip || null,
      port: data.port || null,
      address: data.address || null,
      status: data.status || 'online',

      // 玩家信息
      players: data.players || 0,
      maxPlayers: data.maxPlayers || 0,
      queuedPlayers: data.queuedPlayers || 0,

      // 排名与性能
      rank: data.rank || null,
      fps: data.fps || null,
      fpsAvg: data.fpsAvg || null,
      uptime: data.uptime || null,
      entityCount: data.entityCount || null,

      // 地图信息
      map: data.map || null,
      mapSize: data.mapSize || null,
      seed: data.worldSeed || null,

      // 清档信息
      wipeTime: data.lastWipe ? new Date(data.lastWipe) : null,
      wipeCycle: data.wipeCycle || null,
      nextWipe: data.nextWipe ? new Date(data.nextWipe) : null,

      // 媒体资源
      headerImage: data.headerImage || null,
      logoImage: data.logoImage || null,
      rustMapsUrl: data.rustMapsUrl || null,
      rustMapsThumbnail: data.rustMapsThumbnail || null,

      // 服务器属性
      country: data.country || null,
      official: data.official || false,
      modded: data.modded || false,
      pve: data.pve || false,
      description: data.description || null,
      url: data.url || null
    };
  }

  /**
   * 手动触发更新
   */
  async forceUpdate() {
    logger.info('📊 手动触发 Battlemetrics 更新');
    await this.update();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      isUpdating: this.isUpdating,
      updateInterval: this.updateInterval,
      ...this.stats
    };
  }

  /**
   * 设置更新间隔
   * @param {number} intervalMs - 间隔（毫秒）
   */
  setUpdateInterval(intervalMs) {
    this.updateInterval = intervalMs;

    // 如果正在运行，重启定时器
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    logger.info(`📊 更新间隔已设置为 ${intervalMs / 1000} 秒`);
  }

  /**
   * 辅助函数：延迟
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export default new BattlemetricsScheduler();
