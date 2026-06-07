/**
 * 服务器路由（多租户版本）
 * 所有操作都需要认证并与用户 ID 关联
 */

import express from 'express';
import db from '../lib/db.js';
import { authenticate, requireActiveSubscription } from '../middleware/auth.middleware.js';
import globalServiceManager from '../services/global-manager.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';
import { v4 as uuidv4 } from 'uuid';
import EventTimerManager from '../utils/event-timer.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 获取用户的 RustPlus 服务实例
 * @param {string} userId - 用户 ID
 * @returns {Object|null} UserRustPlusManager 实例
 */
function getUserRustPlusService(userId) {
  const userService = globalServiceManager.getUserService(userId);
  if (!userService) {
    return null;
  }
  return userService.rustPlusService;
}

const MYSQL_INT_MIN = -2147483648;
const MYSQL_INT_MAX = 2147483647;

function safeString(value, maxLength = null, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const text = String(value);
  if (!maxLength) return text;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function safeInt(value, { fallback = null, allowNull = true } = {}) {
  if (value === null || value === undefined || value === '') {
    return allowNull ? null : fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return allowNull ? null : fallback;
  }
  const intValue = Math.trunc(num);
  if (intValue < MYSQL_INT_MIN) return MYSQL_INT_MIN;
  if (intValue > MYSQL_INT_MAX) return MYSQL_INT_MAX;
  return intValue;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractErrorMessage(error, fallback = '未知错误') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error.message === 'string') return error.message;
  if (error.message) {
    try {
      return JSON.stringify(error.message);
    } catch {
      return String(error.message);
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isNoTeamError(message = '') {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('not in team') ||
    text.includes('not in a team') ||
    text.includes('team not found') ||
    text.includes('no team') ||
    text.includes('未加入队伍') ||
    text.includes('不在队伍')
  );
}

function normalizeJsonValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (!value || typeof value !== 'object') return value;

  const normalized = {};
  for (const [key, current] of Object.entries(value)) {
    normalized[key] = normalizeJsonValue(current);
  }
  return normalized;
}

function normalizeTeamInfo(teamInfo) {
  if (!teamInfo || typeof teamInfo !== 'object') {
    return { members: [], leaderSteamId: null };
  }
  const normalized = normalizeJsonValue(teamInfo);
  if (!Array.isArray(normalized.members)) {
    normalized.members = [];
  }
  return normalized;
}

// ============================================================
// 服务器管理
// ============================================================

/**
 * GET /api/servers
 * 获取当前用户的所有服务器
 */
router.get('/', async (req, res) => {
  try {
    const [servers] = await db.query(
      'SELECT * FROM servers WHERE userId = ? ORDER BY createdAt DESC',
      [req.user.id]
    );

    // 添加连接状态
    const rustPlusService = getUserRustPlusService(req.user.id);
    const serversWithStatus = servers.map(server => {
      const connectionState = rustPlusService
        ? rustPlusService.getServerConnectionState(server.id)
        : 'DISCONNECTED';

      return {
        id: server.id,
        name: server.name,
        ip: server.ip,
        port: server.port,
        playerId: server.playerId,
        battlemetricsId: server.battlemetricsId,
        img: server.img,
        logo: server.logo,
        url: server.url,
        description: server.description,
        isActive: !!server.isActive,
        createdAt: server.createdAt,
        connected: connectionState === 'CONNECTED',
        connectionState,
        canDisconnect: connectionState !== 'DISCONNECTED'
      };
    });

    res.json({ success: true, servers: serversWithStatus });
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id
 * 获取单个服务器详情
 */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    const server = rows[0];

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);

    const connectionState = rustPlusService
      ? rustPlusService.getServerConnectionState(server.id)
      : 'DISCONNECTED';

    res.json({
      success: true,
      server: {
        id: server.id,
        name: server.name,
        ip: server.ip,
        port: server.port,
        playerId: server.playerId,
        battlemetricsId: server.battlemetricsId,
        img: server.img,
        logo: server.logo,
        url: server.url,
        description: server.description,
        isActive: !!server.isActive,
        createdAt: server.createdAt,
        connected: connectionState === 'CONNECTED',
        connectionState,
        canDisconnect: connectionState !== 'DISCONNECTED'
      }
    });
  } catch (error) {
    console.error('获取服务器详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/timers
 * 获取服务器当前活跃的事件倒计时（如油井、箱子解锁等）
 */
router.get('/:id/timers', async (req, res) => {
  try {
    const serverId = req.params.id;
    // 验证服务器是否存在
    const [rows] = await db.query('SELECT id FROM servers WHERE id = ? AND userId = ?', [serverId, req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const timers = EventTimerManager.getActiveTimers(serverId);
    res.json({ success: true, timers });
  } catch (error) {
    console.error('获取计时器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/connect
 * 手动连接到服务器
 * 需要有效订阅
 */
router.post('/:id/connect', requireActiveSubscription, async (req, res) => {
  try {
    const serverId = req.params.id;
    const [rows] = await db.query(
      'SELECT * FROM servers WHERE id = ? AND userId = ?',
      [serverId, req.user.id]
    );

    const server = rows[0];

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.status(400).json({ success: false, error: '用户服务未初始化' });
    }

    const connectResult = await rustPlusService.connect({
      serverId: server.id,
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken
    });

    if (connectResult?.queued) {
      return res.status(202).json({
        success: true,
        queued: true,
        reason: connectResult.reason,
        queueId: connectResult.queueId,
        queuePosition: connectResult.queuePosition
      });
    }
    if (connectResult?.assigned && !connectResult.connected) {
      return res.status(202).json({
        success: true,
        queued: true,
        reason: connectResult.reason || 'SESSION_CONNECTING',
        sessionId: connectResult.sessionId,
        nodeId: connectResult.nodeId
      });
    }

    res.json({
      success: true,
      queued: false,
      sessionId: connectResult?.sessionId,
      nodeId: connectResult?.nodeId
    });
  } catch (error) {
    console.error('连接服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/disconnect
 * 手动断开服务器连接
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const serverId = req.params.id;
    const [rows] = await db.query(
      'SELECT id, name FROM servers WHERE id = ? AND userId = ?',
      [serverId, req.user.id]
    );

    const server = rows[0];
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.json({
        success: true,
        disconnected: false,
        cancelledQueue: 0,
        message: '当前没有活动连接'
      });
    }

    const result = await rustPlusService.disconnect(serverId);
    const cancelledQueue = Number(result?.cancelledQueue || 0);
    const disconnected = result?.closed === true;

    let message = '当前没有活动连接';
    if (disconnected) {
      message = `已断开 ${server.name} 的连接`;
    } else if (cancelledQueue > 0) {
      message = `已取消 ${server.name} 的连接请求`;
    }

    return res.json({
      success: true,
      disconnected,
      cancelledQueue,
      message
    });
  } catch (error) {
    console.error('断开服务器失败:', error);
    return res.status(500).json({ success: false, error: error.message || '断开服务器失败' });
  }
});

/**
 * POST /api/servers
 * 添加新服务器
 * 需要有效订阅
 */
router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const { id, name, ip, port, playerId, playerToken } = req.body;

    // 验证必填字段
    if (!id || !name || !ip || !port || !playerId || !playerToken) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 类型验证
    if (typeof id !== 'string' || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'id 和 name 必须是字符串' });
    }

    // 长度限制
    if (id.length > 100) {
      return res.status(400).json({ success: false, error: 'id 长度不能超过 100 字符' });
    }
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: 'name 长度不能超过 100 字符' });
    }
    if (ip.length > 45) {
      return res.status(400).json({ success: false, error: 'ip 长度不能超过 45 字符' });
    }
    if (String(playerId).length > 50) {
      return res.status(400).json({ success: false, error: 'playerId 长度不能超过 50 字符' });
    }
    if (String(playerToken).length > 50) {
      return res.status(400).json({ success: false, error: 'playerToken 长度不能超过 50 字符' });
    }

    // IP 格式验证
    if (typeof ip !== 'string' || !/^[\d.]+$|^[a-zA-Z0-9.-]+$/.test(ip)) {
      return res.status(400).json({ success: false, error: 'ip 格式无效' });
    }

    // 端口验证
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ success: false, error: 'port 必须是 1-65535 之间的数字' });
    }

    // 检查是否已存在相同的服务器（同一用户、同一 IP 和端口）
    const [existing] = await db.query(
      'SELECT id FROM servers WHERE userId = ? AND ip = ? AND port = ?',
      [req.user.id, ip, String(portNum)]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: '该服务器已存在'
      });
    }

    // 创建服务器
    const now = new Date();
    await db.query(
      `INSERT INTO servers (id, userId, name, ip, port, playerId, playerToken, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, name, ip, String(portNum), String(playerId), String(playerToken), now, now]
    );

    res.status(201).json({
      success: true,
      message: '服务器添加成功',
      server: {
        id,
        name
      }
    });
  } catch (error) {
    console.error('添加服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/servers/:id
 * 更新服务器信息
 * 需要有效订阅
 */
router.put('/:id', requireActiveSubscription, async (req, res) => {
  try {
    const { name, ip, port, playerId, playerToken, battlemetricsId, img, logo, url, description } = req.body;

    // 先检查服务器是否存在且属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 构建更新数据
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (ip !== undefined) { updates.push('ip = ?'); params.push(ip); }
    if (port !== undefined) { updates.push('port = ?'); params.push(String(port)); }
    if (playerId !== undefined) { updates.push('playerId = ?'); params.push(String(playerId)); }
    if (playerToken !== undefined) { updates.push('playerToken = ?'); params.push(String(playerToken)); }
    if (battlemetricsId !== undefined) { updates.push('battlemetricsId = ?'); params.push(battlemetricsId); }
    if (img !== undefined) { updates.push('img = ?'); params.push(img); }
    if (logo !== undefined) { updates.push('logo = ?'); params.push(logo); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有提供更新内容' });
    }

    updates.push('updatedAt = ?');
    params.push(new Date());
    params.push(req.params.id);

    await db.query(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ success: true, message: '服务器更新成功' });
  } catch (error) {
    console.error('更新服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/servers/:id
 * 删除服务器
 */
router.delete('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    console.log(`[Server] 删除服务器请求: ${serverId}`);

    // 检查服务器是否存在且属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [serverId, req.user.id]
    );

    if (serverRows.length === 0) {
      console.log(`[Server] 服务器不存在: ${serverId}`);
      return res.status(404).json({
        success: false,
        error: '服务器不存在'
      });
    }

    // 先断开连接（如果已连接）
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (rustPlusService) {
      if (rustPlusService.isConnected(serverId)) {
        console.log(`   - 服务器已连接，正在断开...`);
        try {
          await rustPlusService.disconnect(serverId);
          console.log(`   - 断开成功`);
        } catch (disconnectError) {
          console.error(`[Server] 断开连接失败:`, disconnectError);
          // 继续删除，即使断开失败
        }
      } else {
        console.log(`   - 服务器未连接，清理配置...`);
        await rustPlusService.disconnect(serverId);
      }
    }

    // 从数据库删除（会级联删除关联的设备和事件日志）
    console.log(`   - 正在从数据库删除...`);
    await db.query('DELETE FROM servers WHERE id = ?', [serverId]);

    console.log(`[Server] 服务器删除成功: ${serverId}`);
    res.json({ success: true, message: '服务器删除成功' });
  } catch (error) {
    console.error(`[Server] 删除服务器失败:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 实时 Rust+ 数据接口
// ============================================================

/**
 * GET /api/servers/:id/team
 * 获取基础队伍信息
 */
router.get('/:id/team', async (req, res) => {
  try {
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(req.params.id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    const teamInfo = normalizeTeamInfo(await rustPlusService.getTeamInfo(req.params.id));
    res.json({ success: true, teamInfo });
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error(`[team] 获取队伍信息失败 server=${req.params.id}:`, errorMessage);

    if (isNoTeamError(errorMessage)) {
      return res.json({ success: true, teamInfo: { members: [], leaderSteamId: null } });
    }

    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/servers/:id/team-detailed
 * 获取增强型队伍信息（包含 Steam 头像、封禁状态和今日贡献）
 */
router.get('/:id/team-detailed', async (req, res) => {
  try {
    const serverId = req.params.id;
    const rustPlusService = getUserRustPlusService(req.user.id);

    if (!rustPlusService || !rustPlusService.isConnected(serverId)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    // 1. 获取基础队伍信息
    const teamInfo = normalizeTeamInfo(await rustPlusService.getTeamInfo(serverId));
    if (!teamInfo || !teamInfo.members) {
      return res.json({ success: true, members: [] });
    }

    const steamIds = teamInfo.members.map(m => m.steamId.toString());

    if (steamIds.length === 0) {
      return res.json({ success: true, members: [], leaderId: teamInfo.leaderSteamId?.toString() });
    }

    // 2. 获取数据库中的玩家资料和实时统计
    const placeholders = steamIds.map(() => '?').join(',');

    const [[profiles], [stats], [snapshots]] = await Promise.all([
      db.query(`SELECT * FROM player_profiles WHERE steamId IN (${placeholders})`, steamIds),
      db.query(`SELECT * FROM player_stats WHERE steamId IN (${placeholders})`, steamIds),
      db.query(
        `SELECT * FROM player_stats_snapshots WHERE steamId IN (${placeholders}) AND DATE(snapshotDate) = CURDATE()`,
        steamIds
      )
    ]);

    // 3. 合并数据
    const detailedMembers = teamInfo.members.map(member => {
      const steamId = member.steamId.toString();
      const profile = profiles.find(p => p.steamId === steamId);
      const memberStats = stats.filter(s => s.steamId === steamId);
      const memberSnapshots = snapshots.filter(s => s.steamId === steamId);

      // 计算今日贡献 (实时值 - 今日快照值)
      const contribution = {};
      memberStats.forEach(s => {
        const snapshot = memberSnapshots.find(sn => sn.statKey === s.statKey);
        const diff = snapshot ? (s.statValue - snapshot.statValue) : 0;
        contribution[s.statKey] = Math.max(0, diff); // 防止负数
      });

      return {
        ...member,
        steamId, // 转换为字符串
        avatar: profile?.avatar || null,
        playtime: profile?.playtime || 0,
        vacBanned: !!profile?.vacBanned,
        gameBans: profile?.gameBans || 0,
        contribution
      };
    });

    res.json({
      success: true,
      members: detailedMembers,
      leaderId: teamInfo.leaderSteamId?.toString()
    });
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error('获取增强队伍信息失败:', errorMessage);

    if (isNoTeamError(errorMessage)) {
      return res.json({ success: true, members: [], leaderId: null });
    }

    res.status(500).json({ success: false, error: errorMessage });
  }
});

/**
 * GET /api/servers/:id/extended-teammates
 * 获取扩展队友列表（统一列表，包含在队伍/不在队伍状态）
 */
router.get('/:id/extended-teammates', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;

    // 1. 验证服务器归属
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [serverId, userId]
    );
    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 2. 获取当前队伍成员（实时）
    const rustPlusService = getUserRustPlusService(userId);
    const currentTeamMap = new Map(); // steamId -> teamMember

    if (rustPlusService && rustPlusService.isConnected(serverId)) {
      try {
        const teamInfo = await rustPlusService.getTeamInfo(serverId);
        if (teamInfo?.members) {
          for (const m of teamInfo.members) {
            const steamId = m.steamId?.toString();
            if (steamId) {
              currentTeamMap.set(steamId, m);
            }
          }
        }
      } catch (e) {
        console.error('获取实时队伍失败:', e.message);
      }
    }

    // 3. 获取扩展队友列表（数据库）
    const [extendedRecords] = await db.query(
      'SELECT * FROM extended_teammates WHERE userId = ? AND serverId = ?',
      [userId, serverId]
    );
    const extendedSteamIds = new Set(extendedRecords.map(r => r.steamId));

    // 4. 合并：当前队伍中但不在 extended 表的，也要显示
    const allSteamIds = new Set([...extendedSteamIds, ...currentTeamMap.keys()]);

    if (allSteamIds.size === 0) {
      return res.json({ success: true, teammates: [] });
    }

    const steamIdArray = [...allSteamIds];
    const placeholders = steamIdArray.map(() => '?').join(',');

    // 5. 获取 Steam 资料和统计数据
    const [[profiles], [stats], [todaySnapshots]] = await Promise.all([
      db.query(`SELECT * FROM player_profiles WHERE steamId IN (${placeholders})`, steamIdArray),
      db.query(`SELECT * FROM player_stats WHERE steamId IN (${placeholders})`, steamIdArray),
      db.query(
        `SELECT * FROM player_stats_snapshots WHERE steamId IN (${placeholders}) AND DATE(snapshotDate) = CURDATE()`,
        steamIdArray
      )
    ]);

    // 6. 构建返回数据
    const teammates = steamIdArray.map(steamId => {
      const extRecord = extendedRecords.find(r => r.steamId === steamId);
      const profile = profiles.find(p => p.steamId === steamId);
      const playerStats = stats.filter(s => s.steamId === steamId);
      const playerSnapshots = todaySnapshots.filter(s => s.steamId === steamId);
      const teamMember = currentTeamMap.get(steamId);
      const inTeam = currentTeamMap.has(steamId);

      // 计算今日贡献（所有玩家都计算，不只是在队伍中的）
      const contribution = {};
      playerStats.forEach(s => {
        const snapshot = playerSnapshots.find(sn => sn.statKey === s.statKey);
        const diff = snapshot ? (s.statValue - snapshot.statValue) : 0;
        if (diff > 0) {
          contribution[s.statKey] = diff;
        }
      });

      return {
        steamId,
        name: teamMember?.name || profile?.name || '未知玩家',
        inTeam,
        // 实时数据（仅在队伍中时有）
        x: inTeam ? teamMember?.x : null,
        y: inTeam ? teamMember?.y : null,
        isOnline: inTeam ? teamMember?.isOnline : null,
        isAlive: inTeam ? teamMember?.isAlive : null,
        // Steam 资料
        avatar: profile?.avatar || null,
        playtime: profile?.playtime || 0,
        vacBanned: !!profile?.vacBanned,
        // 贡献数据
        contribution,
        // 时间信息
        addedAt: extRecord?.addedAt || new Date(),
        lastSeenAt: extRecord?.lastSeenAt || (inTeam ? new Date() : null),
        lastUpdated: profile?.lastUpdated || null
      };
    });

    // 按 inTeam 优先排序，然后按 lastSeenAt 排序
    teammates.sort((a, b) => {
      if (a.inTeam !== b.inTeam) return b.inTeam ? 1 : -1;
      return new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0);
    });

    res.json({ success: true, teammates });
  } catch (error) {
    console.error('获取扩展队友列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/refresh-player-data
 * 手动刷新队友的 Steam 数据（与自动刷新逻辑一致）
 */
router.post('/:id/refresh-player-data', requireActiveSubscription, async (req, res) => {
  try {
    const { id: serverId } = req.params;
    const userId = req.user.id;

    // 获取用户的 EventMonitor 服务
    const userService = globalServiceManager.getUserService(userId);
    if (!userService || !userService.eventMonitorService) {
      return res.status(400).json({ success: false, error: '服务未启动' });
    }

    const eventMonitor = userService.eventMonitorService;

    // 检查服务器是否正在监控中
    if (!eventMonitor.eventData.has(serverId)) {
      return res.status(400).json({ success: false, error: '服务器未连接或未启动监控' });
    }

    // 调用与自动刷新相同的方法
    await eventMonitor.refreshPlayerData(serverId);

    res.json({ success: true, message: '刷新完成' });
  } catch (error) {
    console.error('手动刷新玩家数据失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/servers/:id/extended-teammates/:steamId
 * 从扩展队友列表中删除玩家
 */
router.delete('/:id/extended-teammates/:steamId', async (req, res) => {
  try {
    const { id: serverId, steamId } = req.params;
    const userId = req.user.id;

    await db.query(
      'DELETE FROM extended_teammates WHERE userId = ? AND serverId = ? AND steamId = ?',
      [userId, serverId, steamId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/servers/:id/extended-teammates/:steamId
 * 更新玩家备注
 */
router.put('/:id/extended-teammates/:steamId', async (req, res) => {
  try {
    const { id: serverId, steamId } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;

    await db.query(
      'UPDATE extended_teammates SET notes = ? WHERE userId = ? AND serverId = ? AND steamId = ?',
      [notes, userId, serverId, steamId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/player-stats/:steamId
 * 获取玩家详细统计数据
 */
router.get('/:id/player-stats/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    // 1. 获取玩家资料
    const [profileRows] = await db.query(
      'SELECT * FROM player_profiles WHERE steamId = ?',
      [steamId]
    );
    const profile = profileRows[0];

    // 2. 获取当前总统计（实时值）
    const [currentStats] = await db.query(
      'SELECT * FROM player_stats WHERE steamId = ?',
      [steamId]
    );

    // 3. 获取所有快照
    const [allSnapshots] = await db.query(
      'SELECT * FROM player_stats_snapshots WHERE steamId = ? ORDER BY snapshotDate ASC',
      [steamId]
    );

    // 4. 计算今日日期范围
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 5. 分离今日快照和历史快照
    const todaySnapshots = allSnapshots.filter(s =>
      s.snapshotDate >= todayStart && s.snapshotDate <= todayEnd
    );
    const pastSnapshots = allSnapshots.filter(s =>
      s.snapshotDate < todayStart
    );

    // 6. 构建今日15分钟历史记录
    const todayTimeGroups = {};
    todaySnapshots.forEach(snap => {
      const timeKey = snap.snapshotDate.toISOString();
      if (!todayTimeGroups[timeKey]) {
        todayTimeGroups[timeKey] = { time: snap.snapshotDate, stats: {} };
      }
      todayTimeGroups[timeKey].stats[snap.statKey] = snap.statValue;
    });

    const timeKeys = Object.keys(todayTimeGroups).sort();
    const todayHistory = [];

    for (let i = 0; i < timeKeys.length; i++) {
      const current = todayTimeGroups[timeKeys[i]];
      const prev = i > 0 ? todayTimeGroups[timeKeys[i - 1]] : null;

      const contribution = {};
      Object.keys(current.stats).forEach(key => {
        const prevValue = prev ? (prev.stats[key] || 0) : 0;
        const diff = current.stats[key] - prevValue;
        if (diff > 0 && i > 0) {
          contribution[key] = diff;
        }
      });

      if (Object.keys(contribution).length > 0 || i === 0) {
        todayHistory.push({
          snapshotDate: current.time,
          stats: current.stats,
          contribution: i === 0 ? {} : contribution,
          isBaseline: i === 0
        });
      }
    }

    // 6.5 如果当前实时值与最后一个快照不同，添加"当前"记录
    const lastSnapshot = todayHistory.length > 0 ? todayHistory[todayHistory.length - 1] : null;
    if (lastSnapshot && currentStats.length > 0) {
      const currentStatsMap = {};
      currentStats.forEach(s => { currentStatsMap[s.statKey] = s.statValue; });

      const currentContribution = {};
      Object.keys(currentStatsMap).forEach(key => {
        const lastValue = lastSnapshot.stats[key] || 0;
        const diff = currentStatsMap[key] - lastValue;
        if (diff > 0) {
          currentContribution[key] = diff;
        }
      });

      if (Object.keys(currentContribution).length > 0) {
        todayHistory.push({
          snapshotDate: new Date(),
          stats: currentStatsMap,
          contribution: currentContribution,
          isBaseline: false,
          isCurrent: true
        });
      }
    }

    // 7. 构建每日历史汇总（往日数据）
    const dailyData = {};
    pastSnapshots.forEach(snap => {
      const dateKey = snap.snapshotDate.toISOString().split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { earliest: {}, latest: {} };
      }
      if (!dailyData[dateKey].earliestTime || snap.snapshotDate < dailyData[dateKey].earliestTime) {
        dailyData[dateKey].earliest[snap.statKey] = snap.statValue;
        dailyData[dateKey].earliestTime = snap.snapshotDate;
      }
      if (!dailyData[dateKey].latestTime || snap.snapshotDate > dailyData[dateKey].latestTime) {
        dailyData[dateKey].latest[snap.statKey] = snap.statValue;
        dailyData[dateKey].latestTime = snap.snapshotDate;
      }
    });

    const dailyHistory = Object.keys(dailyData)
      .sort()
      .reverse()
      .slice(0, 30)
      .map(date => {
        const dayData = dailyData[date];
        const contribution = {};
        Object.keys(dayData.latest).forEach(key => {
          const diff = dayData.latest[key] - (dayData.earliest[key] || 0);
          if (diff > 0) {
            contribution[key] = diff;
          }
        });
        return { date, contribution };
      })
      .filter(d => Object.keys(d.contribution).length > 0);

    // 8. 计算今日贡献
    const todayBaseline = todayHistory.length > 0 ? todayHistory[0].stats : {};
    const todayContribution = {};
    currentStats.forEach(stat => {
      const baselineValue = todayBaseline[stat.statKey] || 0;
      const diff = stat.statValue - baselineValue;
      if (diff > 0) {
        todayContribution[stat.statKey] = diff;
      }
    });

    // 9. 构建总数据对象
    const totalStats = {};
    currentStats.forEach(stat => {
      totalStats[stat.statKey] = stat.statValue;
    });

    res.json({
      success: true,
      data: {
        profile: profile ? {
          steamId: profile.steamId,
          name: profile.name,
          avatar: profile.avatar,
          playtime: profile.playtime,
          vacBanned: !!profile.vacBanned,
          gameBans: profile.gameBans,
          lastUpdated: profile.lastUpdated
        } : null,
        totalStats,
        todayContribution,
        todayHistory: todayHistory.reverse(),
        dailyHistory
      }
    });
  } catch (error) {
    console.error('获取玩家统计失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/chat
 * 获取队伍聊天历史
 */
router.get('/:id/chat', async (req, res) => {
  try {
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(req.params.id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    const messages = await rustPlusService.getTeamChat(req.params.id);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/chat
 * 发送队伍消息
 */
router.post('/:id/chat', requireActiveSubscription, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: '消息内容不能为空' });

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(req.params.id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    await rustPlusService.sendTeamMessage(req.params.id, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/map-info
 * 获取地图标记和世界尺寸
 */
router.get('/:id/map-info', async (req, res) => {
  try {
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(req.params.id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    // 获取地图数据（包含图片尺寸和海洋边距）
    let mapData = null;
    try {
      mapData = await rustPlusService.getMap(req.params.id);
    } catch (e) {
      // 忽略错误，使用默认值
    }

    const [markers, info] = await Promise.all([
      rustPlusService.getMapMarkers(req.params.id),
      rustPlusService.getServerInfo(req.params.id)
    ]);

    // 获取服务器的img字段
    const [serverRows] = await db.query(
      'SELECT img FROM servers WHERE id = ?',
      [req.params.id]
    );
    const server = serverRows[0];

    // 图片尺寸和海洋边距（像素单位）
    const imageWidth = mapData?.width || 2048;
    const imageHeight = mapData?.height || 2048;
    const oceanMargin = mapData?.oceanMargin || 0;

    res.json({
      success: true,
      markers,
      mapSize: info?.mapSize || 4500,
      monuments: info?.monuments || [],
      img: server?.img || null,
      // 新增：图片尺寸（像素），用于正确的坐标转换
      imageWidth,
      imageHeight,
      oceanMargin  // 注意：这是像素单位
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/map-image
 * 获取地图图片
 */
router.get('/:id/map-image', async (req, res) => {
  try {
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(req.params.id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    const mapData = await rustPlusService.getMap(req.params.id);

    if (!mapData || !mapData.jpgImage) {
      return res.status(404).json({ success: false, error: '地图图片不可用' });
    }

    const imageBuffer = Buffer.from(mapData.jpgImage);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(imageBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 设备管理
// ============================================================

/**
 * GET /api/servers/:id/devices
 * 获取服务器的所有设备
 */
router.get('/:id/devices', async (req, res) => {
  try {
    // 先验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取设备列表
    const [devices] = await db.query(
      'SELECT * FROM devices WHERE serverId = ? ORDER BY createdAt ASC',
      [req.params.id]
    );

    // 检查服务器是否已连接
    const rustPlusService = getUserRustPlusService(req.user.id);
    const isConnected = rustPlusService && rustPlusService.isConnected(req.params.id);

    // 转换为前端格式
    const devicesFormatted = await Promise.all(
      devices.map(async (device) => {
        let currentValue = false;

        if (isConnected) {
          try {
            const entityInfo = await rustPlusService.getEntityInfo(req.params.id, device.entityId);
            if (entityInfo && entityInfo.payload) {
              currentValue = entityInfo.payload.value || false;
            }
          } catch (error) {
            console.error(`获取设备 ${device.entityId} 状态失败:`, error.message);
          }
        }

        const autoModeToNum = {
          'NONE': 0, 'DAY_ON': 1, 'NIGHT_ON': 2, 'ALWAYS_ON': 3,
          'ALWAYS_OFF': 4, 'ONLINE_ON': 7, 'ONLINE_OFF': 8
        };

        return {
          id: device.id,
          entityId: device.entityId,
          name: device.name,
          type: device.type,
          command: device.command,
          message: device.message,
          autoMode: autoModeToNum[device.autoMode] ?? 0,
          isActive: !!device.isActive,
          reachable: !!device.reachable,
          lastTrigger: device.lastTrigger,
          createdAt: device.createdAt,
          currentValue
        };
      })
    );

    res.json({ success: true, devices: devicesFormatted });
  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/devices
 * 添加设备
 */
router.post('/:id/devices', requireActiveSubscription, async (req, res) => {
  try {
    const { entityId, name, type } = req.body;
    const serverId = req.params.id;

    if (!entityId || !name) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id, userId FROM servers WHERE id = ? AND userId = ?',
      [serverId, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    if (name.length > 100) {
      return res.status(400).json({ success: false, error: '设备名称长度不能超过 100 字符' });
    }

    const entityIdNum = parseInt(entityId);
    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 检查设备是否已存在
    const [existing] = await db.query(
      'SELECT id FROM devices WHERE serverId = ? AND entityId = ?',
      [serverId, entityIdNum]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: '该设备已存在' });
    }

    const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
    const deviceType = type ? type.toUpperCase() : 'SWITCH';
    if (!validTypes.includes(deviceType)) {
      return res.status(400).json({ success: false, error: '无效的设备类型' });
    }

    const deviceId = uuidv4();
    const now = new Date();

    await db.query(
      `INSERT INTO devices (id, serverId, userId, entityId, name, type, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, serverId, req.user.id, entityIdNum, name, deviceType, now, now]
    );

    res.status(201).json({
      success: true,
      message: '设备添加成功',
      device: { id: deviceId, entityId: entityIdNum, name }
    });
  } catch (error) {
    console.error('添加设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/servers/:id/devices/:entityId
 * 更新设备配置
 */
router.put('/:id/devices/:entityId', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找设备
    const [deviceRows] = await db.query(
      'SELECT id FROM devices WHERE serverId = ? AND entityId = ?',
      [id, entityIdNum]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const device = deviceRows[0];
    const { name, type, command, message, auto_mode } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 100) {
        return res.status(400).json({ success: false, error: '设备名称无效或过长' });
      }
      updates.push('name = ?');
      params.push(name);
    }

    if (type !== undefined) {
      const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
      const deviceType = type.toUpperCase();
      if (!validTypes.includes(deviceType)) {
        return res.status(400).json({ success: false, error: '无效的设备类型' });
      }
      updates.push('type = ?');
      params.push(deviceType);
    }

    if (command !== undefined) {
      if (command !== null && (typeof command !== 'string' || command.length > 50)) {
        return res.status(400).json({ success: false, error: '命令名称无效或过长' });
      }
      const builtInCommands = ['help', 'time', 'pop', 'team', 'online', 'afk', 'cargo', 'small', 'large', 'heli', 'events', 'history', 'shop', 'leader', 'tr'];
      if (command && builtInCommands.includes(command.toLowerCase())) {
        return res.status(400).json({ success: false, error: `命令名称 "${command}" 与内置命令冲突` });
      }
      updates.push('command = ?');
      params.push(command || null);
    }

    if (message !== undefined) {
      if (message !== null && (typeof message !== 'string' || message.length > 255)) {
        return res.status(400).json({ success: false, error: '警报消息过长（最多255字符）' });
      }
      updates.push('message = ?');
      params.push(message || null);
    }

    if (auto_mode !== undefined) {
      const autoModeMap = {
        0: 'NONE', 1: 'DAY_ON', 2: 'NIGHT_ON', 3: 'ALWAYS_ON',
        4: 'ALWAYS_OFF', 7: 'ONLINE_ON', 8: 'ONLINE_OFF'
      };
      const modeNum = parseInt(auto_mode);
      if (!(modeNum in autoModeMap)) {
        return res.status(400).json({ success: false, error: '自动化模式必须是 0-4 或 7-8' });
      }
      updates.push('autoMode = ?');
      params.push(autoModeMap[modeNum]);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有提供有效的更新字段' });
    }

    updates.push('updatedAt = ?');
    params.push(new Date());
    params.push(device.id);

    await db.query(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, message: '设备更新成功' });
  } catch (error) {
    console.error('更新设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/servers/:id/devices/:entityId
 * 删除设备
 */
router.delete('/:id/devices/:entityId', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找并删除设备
    const [deviceRows] = await db.query(
      'SELECT id FROM devices WHERE serverId = ? AND entityId = ?',
      [id, entityIdNum]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    await db.query('DELETE FROM devices WHERE id = ?', [deviceRows[0].id]);

    res.json({ success: true, message: '设备删除成功' });
  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/devices/:entityId/status
 * 获取设备实时状态
 */
router.get('/:id/devices/:entityId/status', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.status(400).json({ success: false, error: '用户服务未初始化' });
    }

    if (!rustPlusService.isConnected(id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    const info = await rustPlusService.getEntityInfo(id, entityIdNum);
    if (!info || !info.payload) {
      return res.status(404).json({ success: false, error: '无法获取设备状态' });
    }

    res.json({
      success: true,
      entityId: entityIdNum,
      value: info.payload.value || false,
      capacity: info.payload.capacity || 0,
      hasProtection: info.payload.hasProtection || false,
      protectionExpiry: info.payload.protectionExpiry || 0
    });
  } catch (error) {
    console.error('获取设备状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/devices/check-reachability
 * 检测所有设备的可达性
 */
router.post('/:id/devices/check-reachability', async (req, res) => {
  try {
    const serverId = req.params.id;
    const { removeUnreachable = false } = req.body;

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [serverId, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(serverId)) {
      return res.status(400).json({ success: false, error: '服务器未连接，无法检测设备' });
    }

    const [devices] = await db.query('SELECT * FROM devices WHERE serverId = ?', [serverId]);

    if (devices.length === 0) {
      return res.json({ success: true, message: '没有设备需要检测', devices: [], unreachable: [] });
    }

    const unreachableDevices = [];
    const reachableDevices = [];
    const now = new Date();

    for (const device of devices) {
      try {
        const info = await rustPlusService.getEntityInfo(serverId, device.entityId);
        if (info && info.payload !== undefined) {
          reachableDevices.push(device);
          if (!device.reachable) {
            await db.query(
              'UPDATE devices SET reachable = 1, updatedAt = ? WHERE id = ?',
              [now, device.id]
            );
          }
        } else {
          throw new Error('无法获取设备信息');
        }
      } catch (error) {
        unreachableDevices.push({
          id: device.id,
          entityId: device.entityId,
          name: device.name,
          type: device.type,
          error: error.message
        });
        await db.query(
          'UPDATE devices SET reachable = 0, updatedAt = ? WHERE id = ?',
          [now, device.id]
        );
      }
    }

    let removedCount = 0;
    if (removeUnreachable && unreachableDevices.length > 0) {
      const unreachableIds = unreachableDevices.map(d => d.id);
      const placeholders = unreachableIds.map(() => '?').join(',');
      await db.query(`DELETE FROM devices WHERE id IN (${placeholders})`, unreachableIds);
      removedCount = unreachableDevices.length;
    }

    res.json({
      success: true,
      message: `检测完成: ${reachableDevices.length} 个可达, ${unreachableDevices.length} 个不可达${removedCount > 0 ? `, 已删除 ${removedCount} 个` : ''}`,
      total: devices.length,
      reachableCount: reachableDevices.length,
      unreachableCount: unreachableDevices.length,
      removedCount,
      unreachable: unreachableDevices
    });
  } catch (error) {
    console.error('检测设备可达性失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 事件日志
// ============================================================

/**
 * GET /api/servers/:id/events
 * 获取服务器事件日志
 */
router.get('/:id/events', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const limit = parseInt(req.query.limit) || 100;
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({ success: false, error: 'limit 必须在 1-1000 之间' });
    }

    const [events] = await db.query(
      'SELECT * FROM event_logs WHERE serverId = ? ORDER BY createdAt DESC LIMIT ?',
      [req.params.id, limit]
    );

    const eventsFormatted = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      eventData: typeof event.eventData === 'string' ? JSON.parse(event.eventData) : event.eventData,
      createdAt: event.createdAt
    }));

    res.json({ success: true, events: eventsFormatted });
  } catch (error) {
    console.error('获取事件日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// Battlemetrics 集成
// ============================================================

/**
 * GET /api/servers/:id/battlemetrics
 * 获取 Battlemetrics 详细信息
 */
router.get('/:id/battlemetrics', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT * FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const server = serverRows[0];
    let battlemetricsId = server.battlemetricsId;
    let bmInfo = null;

    const buildDegradedResponse = (reason = 'UNAVAILABLE') => ({
      success: true,
      degraded: true,
      reason,
      message: '暂未匹配到 Battlemetrics 信息，已回退为基础服务器数据',
      data: {
        battlemetricsId: battlemetricsId || null,
        name: server.name || 'Unknown',
        ip: server.ip,
        port: safeInt(server.port, { fallback: null, allowNull: true }),
        address: `${server.ip}:${server.port}`,
        status: 'unknown',
        players: 0,
        maxPlayers: 0,
        queuedPlayers: 0,
        rank: null,
        fps: null,
        fpsAvg: null,
        uptime: null,
        entityCount: null,
        map: null,
        mapSize: null,
        seed: null,
        wipeTime: null,
        wipeCycle: null,
        nextWipe: null,
        headerImage: null,
        logoImage: null,
        rustMapsUrl: null,
        rustMapsThumbnail: null,
        country: null,
        official: false,
        modded: false,
        pve: false,
        description: null,
        url: null,
        onlinePlayers: [],
        allOnlinePlayers: []
      }
    });

    const rematchBattlemetrics = async (reason) => {
      const matchedId = await battlemetricsService.searchServerByAddress(
        server.ip,
        server.port,
        server.name
      );

      if (!matchedId) {
        console.warn(`[battlemetrics] 服务器 ${req.params.id} 重新匹配失败 (reason=${reason})`);
        return null;
      }

      if (String(matchedId) !== String(battlemetricsId || '')) {
        await db.query(
          'UPDATE servers SET battlemetricsId = ?, updatedAt = ? WHERE id = ? AND userId = ?',
          [matchedId, new Date(), req.params.id, req.user.id]
        );
      }

      battlemetricsId = matchedId;
      const [matchedRows] = await db.query(
        'SELECT * FROM public_servers WHERE battlemetricsId = ?',
        [battlemetricsId]
      );
      bmInfo = matchedRows[0] || null;
      return matchedId;
    };

    const ensureFreshDataMatches = async (freshData, reason) => {
      if (!freshData) {
        return null;
      }

      if (battlemetricsService.isLikelyServerMatch(server, freshData)) {
        return freshData;
      }

      console.warn(`[battlemetrics] 检测到 Battlemetrics 数据与用户服务器不一致 serverId=${req.params.id} bmId=${battlemetricsId}`);
      const previousId = String(battlemetricsId || '');
      const rematchedId = await rematchBattlemetrics(reason);
      if (!rematchedId || String(rematchedId) === previousId) {
        return null;
      }

      const rematchedData = await battlemetricsService.getServerInfo(rematchedId);
      if (!rematchedData || !battlemetricsService.isLikelyServerMatch(server, rematchedData)) {
        return null;
      }
      return rematchedData;
    };

    if (!battlemetricsId) {
      const matchedId = await rematchBattlemetrics('MISSING_BINDING');
      if (!matchedId) {
        return res.json(buildDegradedResponse('NOT_FOUND'));
      }
    } else {
      const [bmRows] = await db.query(
        'SELECT * FROM public_servers WHERE battlemetricsId = ?',
        [battlemetricsId]
      );
      bmInfo = bmRows[0] || null;

      if (bmInfo && !battlemetricsService.isLikelyServerMatch(server, bmInfo)) {
        console.warn(`[battlemetrics] 检测到疑似错绑 serverId=${req.params.id} bmId=${battlemetricsId}`);
        const rematchedId = await rematchBattlemetrics('CACHE_BINDING_MISMATCH');
        if (!rematchedId) {
          return res.json(buildDegradedResponse('BINDING_MISMATCH'));
        }
      }
    }

    // 如果缓存不存在或数据太旧，则实时获取
    const CACHE_TTL = 5 * 60 * 1000;
    const isStale = !bmInfo || (Date.now() - new Date(bmInfo.updatedAt).getTime() > CACHE_TTL);

    // 在线玩家列表变化频繁，每次都获取最新数据
    let onlinePlayers = [];
    let allOnlinePlayers = [];

    if (isStale) {
      // 缓存过期，获取完整数据并更新缓存
      try {
        let freshData = await battlemetricsService.getServerInfo(battlemetricsId);
        freshData = await ensureFreshDataMatches(freshData, 'FRESH_DATA_MISMATCH');
        if (!freshData) {
          return res.json(buildDegradedResponse('FRESH_DATA_MISMATCH'));
        }

        onlinePlayers = freshData?.onlinePlayers || [];
        allOnlinePlayers = freshData?.allOnlinePlayers || [];

        if (freshData) {
          const now = new Date();
          const upsertData = {
            name: safeString(freshData.name, 255, 'Unknown'),
            ip: safeString(freshData.ip, 45, null),
            port: safeInt(freshData.port, { fallback: null, allowNull: true }),
            address: safeString(freshData.address, 100, null),
            status: safeString(freshData.status, 20, 'online'),
            players: safeInt(freshData.players, { fallback: 0, allowNull: false }),
            maxPlayers: safeInt(freshData.maxPlayers, { fallback: 0, allowNull: false }),
            queuedPlayers: safeInt(freshData.queuedPlayers, { fallback: 0, allowNull: false }),
            rank: safeInt(freshData.rank, { fallback: null, allowNull: true }),
            fps: safeInt(freshData.fps, { fallback: null, allowNull: true }),
            fpsAvg: safeInt(freshData.fpsAvg, { fallback: null, allowNull: true }),
            uptime: safeInt(freshData.uptime, { fallback: null, allowNull: true }),
            entityCount: safeInt(freshData.entityCount, { fallback: null, allowNull: true }),
            map: safeString(freshData.map, 100, null),
            mapSize: safeInt(freshData.mapSize, { fallback: null, allowNull: true }),
            seed: safeInt(freshData.worldSeed, { fallback: null, allowNull: true }),
            wipeTime: safeDate(freshData.lastWipe),
            wipeCycle: safeString(freshData.wipeCycle, 20, null),
            nextWipe: safeDate(freshData.nextWipe),
            headerImage: safeString(freshData.headerImage, null, null),
            logoImage: safeString(freshData.logoImage, null, null),
            rustMapsUrl: safeString(freshData.rustMapsUrl, 255, null),
            rustMapsThumbnail: safeString(freshData.rustMapsThumbnail, null, null),
            country: safeString(freshData.country, 50, null),
            official: freshData.official ? 1 : 0,
            modded: freshData.modded ? 1 : 0,
            pve: freshData.pve ? 1 : 0,
            description: safeString(freshData.description, null, null),
            url: safeString(freshData.url, 255, null)
          };
          const upsertColumns = Object.keys(upsertData);
          const escapedUpsertColumns = upsertColumns.map(column => `\`${column}\``);
          const upsertValues = upsertColumns.map(column => upsertData[column]);

          if (bmInfo) {
            // Update
            // Use escaped identifiers to avoid SQL keyword conflicts (e.g. `rank`).
            const updateParts = escapedUpsertColumns.map(column => `${column} = ?`);
            updateParts.push('updatedAt = ?');
            const updateParams = [...upsertValues, now, battlemetricsId];
            await db.query(
              `UPDATE public_servers SET ${updateParts.join(', ')} WHERE battlemetricsId = ?`,
              updateParams
            );
          } else {
            // Insert
            await db.query(
              `INSERT INTO public_servers (battlemetricsId, ${escapedUpsertColumns.join(', ')}, createdAt, updatedAt)
               VALUES (?, ${upsertColumns.map(() => '?').join(', ')}, ?, ?)`,
              [battlemetricsId, ...upsertValues, now, now]
            );
          }

          // Re-fetch
          const [newBmRows] = await db.query(
            'SELECT * FROM public_servers WHERE battlemetricsId = ?',
            [battlemetricsId]
          );
          bmInfo = newBmRows[0];
        }
      } catch (bmError) {
        console.warn(`[battlemetrics] 获取或写入缓存失败 server=${req.params.id}: ${bmError.message}`);
      }
    } else {
      // 缓存未过期，但在线玩家列表仍需实时获取
      try {
        let freshData = await battlemetricsService.getServerInfo(battlemetricsId);
        freshData = await ensureFreshDataMatches(freshData, 'ONLINE_LIST_MISMATCH');
        if (!freshData) {
          return res.json(buildDegradedResponse('ONLINE_LIST_MISMATCH'));
        }
        onlinePlayers = freshData?.onlinePlayers || [];
        allOnlinePlayers = freshData?.allOnlinePlayers || [];
      } catch (bmError) {
        console.warn(`[battlemetrics] 获取在线玩家失败 server=${req.params.id}: ${bmError.message}`);
      }
    }

    if (!bmInfo) {
      return res.json(buildDegradedResponse('CACHE_MISS'));
    }

    // Convert booleans
    bmInfo.official = !!bmInfo.official;
    bmInfo.modded = !!bmInfo.modded;
    bmInfo.pve = !!bmInfo.pve;

    // 附加在线玩家列表（不存储在数据库中）
    bmInfo.onlinePlayers = onlinePlayers;
    bmInfo.allOnlinePlayers = allOnlinePlayers.length > 0 ? allOnlinePlayers : onlinePlayers;

    res.json({ success: true, data: bmInfo });
  } catch (error) {
    console.error('获取 Battlemetrics 信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/intelligence
 * 聚合 API: 获取服务器综合情报
 */
router.get('/:id/intelligence', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user.id;

    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT * FROM servers WHERE id = ? AND userId = ?',
      [serverId, userId]
    );

    if (serverRows.length === 0) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const server = serverRows[0];

    // 获取 Battlemetrics 数据
    const [bmRows] = server.battlemetricsId
      ? await db.query('SELECT * FROM public_servers WHERE battlemetricsId = ?', [server.battlemetricsId])
      : [[]];

    const bmInfo = bmRows[0];

    // 获取连接状态
    const rustPlusService = getUserRustPlusService(userId);
    const connected = rustPlusService ? rustPlusService.isConnected(serverId) : false;

    res.json({
      success: true,
      data: {
        server: {
          id: server.id,
          name: server.name,
          ip: server.ip,
          port: server.port,
          battlemetricsId: server.battlemetricsId,
          connected
        },
        battlemetrics: bmInfo ? {
          name: bmInfo.name,
          status: bmInfo.status,
          players: bmInfo.players,
          maxPlayers: bmInfo.maxPlayers,
          queuedPlayers: bmInfo.queuedPlayers,
          rank: bmInfo.rank,
          fps: bmInfo.fps,
          fpsAvg: bmInfo.fpsAvg,
          uptime: bmInfo.uptime,
          entityCount: bmInfo.entityCount,
          map: bmInfo.map,
          mapSize: bmInfo.mapSize,
          seed: bmInfo.seed,
          wipeTime: bmInfo.wipeTime,
          nextWipe: bmInfo.nextWipe,
          wipeCycle: bmInfo.wipeCycle,
          headerImage: bmInfo.headerImage,
          rustMapsThumbnail: bmInfo.rustMapsThumbnail,
          rustMapsUrl: bmInfo.rustMapsUrl,
          country: bmInfo.country,
          official: !!bmInfo.official,
          modded: !!bmInfo.modded,
          pve: !!bmInfo.pve,
          updatedAt: bmInfo.updatedAt
        } : null
      }
    });
  } catch (error) {
    console.error('获取服务器情报失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/battlemetrics/top-players
 * 获取服务器玩家排行
 */
router.get('/:id/battlemetrics/top-players', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const [serverRows] = await db.query(
      'SELECT battlemetricsId FROM servers WHERE id = ? AND userId = ?',
      [req.params.id, req.user.id]
    );

    if (serverRows.length === 0 || !serverRows[0].battlemetricsId) {
      return res.status(404).json({
        success: false,
        error: '服务器不存在或未关联 Battlemetrics'
      });
    }

    const days = parseInt(req.query.days) || 30;
    if (days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'days 必须在 1-365 之间' });
    }

    const players = await battlemetricsService.getTopPlayers(serverRows[0].battlemetricsId, days);

    res.json({ success: true, players });
  } catch (error) {
    console.error('获取玩家排行失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 连接设置
// ============================================================

/**
 * GET /api/servers/settings/connection
 * 获取连接设置（分布式固定模式）
 */
router.get('/settings/connection', (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        mode: 'distributed',
        description: '固定分布式连接模式（由连接节点池承载 Rust 连接）'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/settings/connection
 * 分布式模式下不支持切换连接模式
 */
router.post('/settings/connection', (req, res) => {
  res.status(400).json({
    success: false,
    error: '分布式模式下不支持切换连接模式'
  });
});

export default router;
