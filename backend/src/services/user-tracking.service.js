/**
 * UserTrackingService - 玩家追踪服务
 * 管理用户追踪的玩家，轮询检测在线状态变化
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import battlemetricsService from './battlemetrics.service.js';

class UserTrackingService extends EventEmitter {
  constructor(userId) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    this.userId = userId;
    this.isRunning = false;
    this.pollInterval = null;
    this.pollIntervalMs = 60000; // 60秒轮询

    // 内存中缓存的用户追踪列表
    this.trackedPlayers = new Map(); // steamId -> trackedPlayer record

    // 用户服务器的 Battlemetrics ID 列表（用于判断同服通知）
    this.userServerBmIds = new Set();
  }

  /**
   * 启动追踪服务
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    try {
      // 加载用户追踪的玩家列表
      await this._loadTrackedPlayers();

      // 加载用户服务器的 Battlemetrics ID
      await this._loadUserServerBmIds();

      // 如果有追踪的玩家，开始轮询
      if (this.trackedPlayers.size > 0) {
        this._startPolling();
      }

      this.isRunning = true;
      console.log(`[TRACKING] 用户 ${this.userId} 的追踪服务已启动，追踪 ${this.trackedPlayers.size} 个玩家`);
    } catch (error) {
      console.error(`[TRACKING] 启动追踪服务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止追踪服务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this._stopPolling();
    this.trackedPlayers.clear();
    this.userServerBmIds.clear();
    this.isRunning = false;

    console.log(`[TRACKING] 用户 ${this.userId} 的追踪服务已停止`);
  }

  /**
   * 加载用户追踪的玩家列表
   * @private
   */
  async _loadTrackedPlayers() {
    try {
      const [rows] = await db.query(
        `SELECT tp.*, tpc.currentName, tpc.isOnline, tpc.currentServerBmId, tpc.currentServerName,
                tpc.lastOnlineTime, tpc.lastOfflineTime, tpc.sessionStartTime
         FROM tracked_players tp
         LEFT JOIN tracked_player_cache tpc ON tp.steamId = tpc.steamId
         WHERE tp.userId = ? AND tp.isActive = 1`,
        [this.userId]
      );

      this.trackedPlayers.clear();
      for (const row of rows) {
        this.trackedPlayers.set(row.steamId, {
          ...row,
          // 从缓存获取的在线状态
          cachedOnline: row.isOnline === 1,
          cachedServerBmId: row.currentServerBmId,
          cachedServerName: row.currentServerName
        });
      }
    } catch (error) {
      console.error(`[TRACKING] 加载追踪列表失败: ${error.message}`);
    }
  }

  /**
   * 加载用户服务器的 Battlemetrics ID
   * @private
   */
  async _loadUserServerBmIds() {
    try {
      const [rows] = await db.query(
        `SELECT battlemetricsId FROM servers WHERE userId = ? AND battlemetricsId IS NOT NULL`,
        [this.userId]
      );

      this.userServerBmIds.clear();
      for (const row of rows) {
        if (row.battlemetricsId) {
          this.userServerBmIds.add(row.battlemetricsId);
        }
      }
    } catch (error) {
      console.error(`[TRACKING] 加载用户服务器 BM ID 失败: ${error.message}`);
    }
  }

  /**
   * 开始轮询
   * @private
   */
  _startPolling() {
    if (this.pollInterval) {
      return;
    }

    // 立即执行一次检查
    this._checkAllPlayers();

    // 设置轮询
    this.pollInterval = setInterval(() => {
      this._checkAllPlayers();
    }, this.pollIntervalMs);
  }

  /**
   * 停止轮询
   * @private
   */
  _stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * 检查所有追踪玩家的状态
   * @private
   */
  async _checkAllPlayers() {
    if (this.trackedPlayers.size === 0) {
      return;
    }

    console.log(`[TRACKING] 检查 ${this.trackedPlayers.size} 个追踪玩家状态...`);

    for (const [steamId, player] of this.trackedPlayers) {
      try {
        await this._checkPlayerStatus(steamId, player);
      } catch (error) {
        console.error(`[TRACKING] 检查玩家 ${steamId} 状态失败: ${error.message}`);
      }
    }
  }

  /**
   * 检查单个玩家状态
   * @private
   */
  async _checkPlayerStatus(steamId, player) {
    // 获取 Battlemetrics 玩家 ID
    let bmPlayerId = player.battlemetricsId;

    // 如果没有 BM ID，尝试匹配
    if (!bmPlayerId) {
      const matchResult = await battlemetricsService.matchPlayerBySteamId(steamId);
      if (matchResult) {
        bmPlayerId = matchResult.playerId;
        // 更新数据库
        await db.query(
          'UPDATE tracked_players SET battlemetricsId = ?, updatedAt = NOW() WHERE id = ?',
          [bmPlayerId, player.id]
        );
        player.battlemetricsId = bmPlayerId;
      } else {
        // 无法匹配，跳过
        return;
      }
    }

    // 获取玩家在线状态
    const onlineStatus = await battlemetricsService.getPlayerOnlineStatus(bmPlayerId);

    // 获取缓存的旧状态
    const wasOnline = player.cachedOnline;
    const oldServerBmId = player.cachedServerBmId;
    const oldServerName = player.cachedServerName;

    // 当前状态
    const isNowOnline = onlineStatus.online;
    const currentServerBmId = onlineStatus.server?.id || null;
    const currentServerName = onlineStatus.server?.name || null;
    const playerName = onlineStatus.session?.name || player.currentName || 'Unknown';

    // 检测状态变化
    if (!wasOnline && isNowOnline) {
      // 上线事件
      await this._handlePlayerOnline(steamId, player, {
        playerName,
        serverBmId: currentServerBmId,
        serverName: currentServerName
      });
    } else if (wasOnline && !isNowOnline) {
      // 下线事件
      await this._handlePlayerOffline(steamId, player, {
        playerName,
        serverBmId: oldServerBmId,
        serverName: oldServerName
      });
    } else if (wasOnline && isNowOnline && oldServerBmId !== currentServerBmId) {
      // 换服事件
      await this._handleServerChange(steamId, player, {
        playerName,
        fromServerBmId: oldServerBmId,
        fromServerName: oldServerName,
        toServerBmId: currentServerBmId,
        toServerName: currentServerName
      });
    }

    // 更新缓存
    await this._updatePlayerCache(steamId, {
      battlemetricsId: bmPlayerId,
      currentName: playerName,
      isOnline: isNowOnline,
      currentServerBmId,
      currentServerName,
      lastOnlineTime: isNowOnline ? new Date() : player.lastOnlineTime,
      lastOfflineTime: !isNowOnline && wasOnline ? new Date() : player.lastOfflineTime,
      sessionStartTime: isNowOnline && !wasOnline ? new Date() : player.sessionStartTime
    });

    // 更新内存缓存
    player.cachedOnline = isNowOnline;
    player.cachedServerBmId = currentServerBmId;
    player.cachedServerName = currentServerName;
    player.currentName = playerName;
  }

  /**
   * 处理玩家上线事件
   * @private
   */
  async _handlePlayerOnline(steamId, player, data) {
    const { playerName, serverBmId, serverName } = data;

    // 判断是否在用户的服务器
    const isSameServer = serverBmId && this.userServerBmIds.has(serverBmId);
    const isHighPriority = player.priority === 'HIGH' || isSameServer;

    console.log(`[TRACKING] 玩家上线: ${playerName} (${steamId}) @ ${serverName}`);

    // 保存事件日志
    const eventId = uuidv4();
    await db.query(
      `INSERT INTO tracking_events (id, userId, steamId, eventType, playerName, serverBmId, serverName, eventData, createdAt)
       VALUES (?, ?, ?, 'ONLINE', ?, ?, ?, ?, NOW())`,
      [eventId, this.userId, steamId, playerName, serverBmId, serverName, JSON.stringify({
        isSameServer,
        notes: player.notes,
        groupName: player.groupName
      })]
    );

    // 发送事件
    this.emit('tracking:online', {
      userId: this.userId,
      steamId,
      playerName,
      serverBmId,
      serverName,
      isSameServer,
      isHighPriority,
      notes: player.notes,
      groupName: player.groupName,
      time: Date.now()
    });
  }

  /**
   * 处理玩家下线事件
   * @private
   */
  async _handlePlayerOffline(steamId, player, data) {
    const { playerName, serverBmId, serverName } = data;

    // 计算在线时长
    let sessionDuration = null;
    if (player.sessionStartTime) {
      sessionDuration = Math.floor((Date.now() - new Date(player.sessionStartTime).getTime()) / 1000);
    }

    console.log(`[TRACKING] 玩家下线: ${playerName} (${steamId}), 在线时长: ${sessionDuration ? Math.floor(sessionDuration / 60) + '分钟' : '未知'}`);

    // 保存事件日志
    const eventId = uuidv4();
    await db.query(
      `INSERT INTO tracking_events (id, userId, steamId, eventType, playerName, serverBmId, serverName, sessionDuration, eventData, createdAt)
       VALUES (?, ?, ?, 'OFFLINE', ?, ?, ?, ?, ?, NOW())`,
      [eventId, this.userId, steamId, playerName, serverBmId, serverName, sessionDuration, JSON.stringify({
        notes: player.notes,
        groupName: player.groupName
      })]
    );

    // 发送事件
    this.emit('tracking:offline', {
      userId: this.userId,
      steamId,
      playerName,
      serverBmId,
      serverName,
      sessionDuration,
      notes: player.notes,
      groupName: player.groupName,
      time: Date.now()
    });
  }

  /**
   * 处理玩家换服事件
   * @private
   */
  async _handleServerChange(steamId, player, data) {
    const { playerName, fromServerBmId, fromServerName, toServerBmId, toServerName } = data;

    // 判断是否换到用户的服务器
    const isEnteringUserServer = toServerBmId && this.userServerBmIds.has(toServerBmId);
    const isHighPriority = player.priority === 'HIGH' || isEnteringUserServer;

    console.log(`[TRACKING] 玩家换服: ${playerName} (${steamId}) ${fromServerName} -> ${toServerName}`);

    // 保存事件日志
    const eventId = uuidv4();
    await db.query(
      `INSERT INTO tracking_events (id, userId, steamId, eventType, playerName, serverBmId, serverName, previousServerBmId, previousServerName, eventData, createdAt)
       VALUES (?, ?, ?, 'SERVER_CHANGE', ?, ?, ?, ?, ?, ?, NOW())`,
      [eventId, this.userId, steamId, playerName, toServerBmId, toServerName, fromServerBmId, fromServerName, JSON.stringify({
        isEnteringUserServer,
        notes: player.notes,
        groupName: player.groupName
      })]
    );

    // 发送事件
    this.emit('tracking:server_change', {
      userId: this.userId,
      steamId,
      playerName,
      fromServerBmId,
      fromServerName,
      toServerBmId,
      toServerName,
      isEnteringUserServer,
      isHighPriority,
      notes: player.notes,
      groupName: player.groupName,
      time: Date.now()
    });
  }

  /**
   * 更新玩家缓存
   * @private
   */
  async _updatePlayerCache(steamId, data) {
    try {
      const { battlemetricsId, currentName, isOnline, currentServerBmId, currentServerName,
              lastOnlineTime, lastOfflineTime, sessionStartTime } = data;

      await db.query(
        `INSERT INTO tracked_player_cache (steamId, battlemetricsId, currentName, isOnline, currentServerBmId, currentServerName, lastOnlineTime, lastOfflineTime, sessionStartTime, lastUpdated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           battlemetricsId = VALUES(battlemetricsId),
           currentName = VALUES(currentName),
           isOnline = VALUES(isOnline),
           currentServerBmId = VALUES(currentServerBmId),
           currentServerName = VALUES(currentServerName),
           lastOnlineTime = VALUES(lastOnlineTime),
           lastOfflineTime = VALUES(lastOfflineTime),
           sessionStartTime = VALUES(sessionStartTime),
           lastUpdated = NOW()`,
        [steamId, battlemetricsId, currentName, isOnline ? 1 : 0, currentServerBmId, currentServerName,
         lastOnlineTime, lastOfflineTime, sessionStartTime]
      );
    } catch (error) {
      console.error(`[TRACKING] 更新玩家缓存失败: ${error.message}`);
    }
  }

  // ============================================================
  // CRUD 操作
  // ============================================================

  /**
   * 添加追踪玩家
   */
  async addTrackedPlayer(steamId, options = {}) {
    const { groupName = '默认', notes = null, priority = 'NORMAL' } = options;

    // 检查是否已存在
    if (this.trackedPlayers.has(steamId)) {
      throw new Error('该玩家已在追踪列表中');
    }

    // 尝试获取 Battlemetrics 玩家信息
    let bmPlayerId = null;
    let playerName = null;

    const matchResult = await battlemetricsService.matchPlayerBySteamId(steamId);
    if (matchResult) {
      bmPlayerId = matchResult.playerId;
      playerName = matchResult.playerName;
    }

    // 插入数据库
    const id = uuidv4();
    await db.query(
      `INSERT INTO tracked_players (id, userId, steamId, battlemetricsId, groupName, notes, priority, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, this.userId, steamId, bmPlayerId, groupName, notes, priority]
    );

    // 添加到内存缓存
    const newPlayer = {
      id,
      userId: this.userId,
      steamId,
      battlemetricsId: bmPlayerId,
      groupName,
      notes,
      priority,
      isActive: 1,
      currentName: playerName,
      cachedOnline: false,
      cachedServerBmId: null,
      cachedServerName: null
    };

    this.trackedPlayers.set(steamId, newPlayer);

    // 如果是第一个追踪的玩家，启动轮询
    if (this.trackedPlayers.size === 1 && this.isRunning) {
      this._startPolling();
    }

    console.log(`[TRACKING] 添加追踪玩家: ${steamId} (${playerName || '未知名称'})`);

    return {
      id,
      steamId,
      battlemetricsId: bmPlayerId,
      currentName: playerName,  // 与 getTrackedPlayers 返回格式保持一致
      groupName,
      notes,
      priority,
      isOnline: false,
      currentServerBmId: null,
      currentServerName: null
    };
  }

  /**
   * 移除追踪玩家
   */
  async removeTrackedPlayer(steamId) {
    const player = this.trackedPlayers.get(steamId);
    if (!player) {
      throw new Error('该玩家不在追踪列表中');
    }

    // 从数据库删除
    await db.query(
      'DELETE FROM tracked_players WHERE userId = ? AND steamId = ?',
      [this.userId, steamId]
    );

    // 从内存缓存移除
    this.trackedPlayers.delete(steamId);

    // 如果没有追踪的玩家了，停止轮询
    if (this.trackedPlayers.size === 0) {
      this._stopPolling();
    }

    console.log(`[TRACKING] 移除追踪玩家: ${steamId}`);

    return { success: true, steamId };
  }

  /**
   * 更新追踪玩家信息
   */
  async updateTrackedPlayer(steamId, updates) {
    const player = this.trackedPlayers.get(steamId);
    if (!player) {
      throw new Error('该玩家不在追踪列表中');
    }

    const { groupName, notes, priority, isActive } = updates;

    // 构建更新语句
    const setClauses = [];
    const values = [];

    if (groupName !== undefined) {
      setClauses.push('groupName = ?');
      values.push(groupName);
    }
    if (notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(notes);
    }
    if (priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(priority);
    }
    if (isActive !== undefined) {
      setClauses.push('isActive = ?');
      values.push(isActive ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return player;
    }

    setClauses.push('updatedAt = NOW()');
    values.push(this.userId, steamId);

    await db.query(
      `UPDATE tracked_players SET ${setClauses.join(', ')} WHERE userId = ? AND steamId = ?`,
      values
    );

    // 更新内存缓存
    if (groupName !== undefined) player.groupName = groupName;
    if (notes !== undefined) player.notes = notes;
    if (priority !== undefined) player.priority = priority;
    if (isActive !== undefined) player.isActive = isActive;

    return player;
  }

  /**
   * 获取追踪玩家列表
   */
  async getTrackedPlayers() {
    const players = [];

    for (const [steamId, player] of this.trackedPlayers) {
      players.push({
        id: player.id,
        steamId,
        battlemetricsId: player.battlemetricsId,
        currentName: player.currentName,
        groupName: player.groupName,
        notes: player.notes,
        priority: player.priority,
        isOnline: player.cachedOnline,
        currentServerBmId: player.cachedServerBmId,
        currentServerName: player.cachedServerName
      });
    }

    return players;
  }

  /**
   * 获取单个追踪玩家详情
   */
  async getTrackedPlayer(steamId) {
    const player = this.trackedPlayers.get(steamId);
    if (!player) {
      return null;
    }

    // 获取玩家详细资料（包含历史名称）
    let profile = null;
    if (player.battlemetricsId) {
      profile = await battlemetricsService.getPlayerProfile(player.battlemetricsId);
    }

    return {
      id: player.id,
      steamId,
      battlemetricsId: player.battlemetricsId,
      currentName: player.currentName,
      groupName: player.groupName,
      notes: player.notes,
      priority: player.priority,
      isOnline: player.cachedOnline,
      currentServerBmId: player.cachedServerBmId,
      currentServerName: player.cachedServerName,
      profile
    };
  }

  /**
   * 获取玩家追踪历史
   */
  async getPlayerHistory(steamId, limit = 50) {
    const [rows] = await db.query(
      `SELECT * FROM tracking_events
       WHERE userId = ? AND steamId = ?
       ORDER BY createdAt DESC
       LIMIT ?`,
      [this.userId, steamId, limit]
    );

    return rows;
  }

  /**
   * 获取所有分组
   */
  async getGroups() {
    const groups = new Set();
    for (const player of this.trackedPlayers.values()) {
      groups.add(player.groupName);
    }
    return Array.from(groups);
  }

  /**
   * 刷新用户服务器 BM ID 列表
   */
  async refreshUserServerBmIds() {
    await this._loadUserServerBmIds();
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      trackedCount: this.trackedPlayers.size,
      userServerCount: this.userServerBmIds.size,
      pollIntervalMs: this.pollIntervalMs
    };
  }
}

export default UserTrackingService;
