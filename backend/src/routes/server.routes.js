/**
 * 服务器路由（多租户版本）
 * 所有操作都需要认证并与用户 ID 关联
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireActiveSubscription } from '../middleware/auth.middleware.js';
import globalServiceManager from '../services/global-manager.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';

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

// ============================================================
// 服务器管理
// ============================================================

/**
 * GET /api/servers
 * 获取当前用户的所有服务器
 */
router.get('/', async (req, res) => {
  try {
    const servers = await prisma.servers.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 添加连接状态
    const rustPlusService = getUserRustPlusService(req.user.id);
    const serversWithStatus = servers.map(server => ({
      id: server.id,
      name: server.name,
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken,
      battlemetricsId: server.battlemetricsId,
      img: server.img,
      logo: server.logo,
      url: server.url,
      description: server.description,
      isActive: server.isActive,
      createdAt: server.createdAt,
      connected: rustPlusService ? rustPlusService.isConnected(server.id) : false
    }));

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
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id // 确保服务器属于当前用户
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);

    res.json({
      success: true,
      server: {
        id: server.id,
        name: server.name,
        ip: server.ip,
        port: server.port,
        playerId: server.playerId,
        playerToken: server.playerToken,
        battlemetricsId: server.battlemetricsId,
        img: server.img,
        logo: server.logo,
        url: server.url,
        description: server.description,
        isActive: server.isActive,
        createdAt: server.createdAt,
        connected: rustPlusService ? rustPlusService.isConnected(server.id) : false
      }
    });
  } catch (error) {
    console.error('获取服务器详情失败:', error);
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
    const server = await prisma.servers.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.status(400).json({ success: false, error: '用户服务未初始化' });
    }

    await rustPlusService.connect({
      serverId: server.id,
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken
    });

    res.json({ success: true });
  } catch (error) {
    console.error('连接服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
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
    const existing = await prisma.servers.findFirst({
      where: {
        userId: req.user.id,
        ip,
        port: String(portNum)
      }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: '该服务器已存在'
      });
    }

    // 创建服务器
    const server = await prisma.servers.create({
      data: {
        id,
        userId: req.user.id, // 关联到当前用户
        name,
        ip,
        port: String(portNum),
        playerId: String(playerId),
        playerToken: String(playerToken)
      }
    });

    res.status(201).json({
      success: true,
      message: '服务器添加成功',
      server: {
        id: server.id,
        name: server.name
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
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, ip, port, playerId, playerToken, battlemetricsId, img, logo, url, description } = req.body;

    // 先检查服务器是否存在且属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 构建更新数据
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (ip !== undefined) updates.ip = ip;
    if (port !== undefined) updates.port = String(port);
    if (playerId !== undefined) updates.playerId = String(playerId);
    if (playerToken !== undefined) updates.playerToken = String(playerToken);
    if (battlemetricsId !== undefined) updates.battlemetricsId = battlemetricsId;
    if (img !== undefined) updates.img = img;
    if (logo !== undefined) updates.logo = logo;
    if (url !== undefined) updates.url = url;
    if (description !== undefined) updates.description = description;

    // 更新服务器
    await prisma.servers.update({
      where: { id: req.params.id },
      data: updates
    });

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
    console.log(`🗑️ 删除服务器请求: ${serverId}`);

    // 检查服务器是否存在且属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

    if (!server) {
      console.log(`❌ 服务器不存在: ${serverId}`);
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
          console.error(`❌ 断开连接失败:`, disconnectError);
          // 继续删除，即使断开失败
        }
      } else {
        console.log(`   - 服务器未连接，清理配置...`);
        await rustPlusService.disconnect(serverId);
      }
    }

    // 从数据库删除（会级联删除关联的设备和事件日志）
    console.log(`   - 正在从数据库删除...`);
    await prisma.servers.delete({
      where: { id: serverId }
    });

    console.log(`✅ 服务器删除成功: ${serverId}`);
    res.json({ success: true, message: '服务器删除成功' });
  } catch (error) {
    console.error(`❌ 删除服务器失败:`, error);
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

    const teamInfo = await rustPlusService.getTeamInfo(req.params.id);
    res.json({ success: true, teamInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    const teamInfo = await rustPlusService.getTeamInfo(serverId);
    if (!teamInfo || !teamInfo.members) {
      return res.json({ success: true, members: [] });
    }

    const steamIds = teamInfo.members.map(m => m.steamId.toString());

    // 2. 获取数据库中的玩家资料和实时统计
    const [profiles, stats, snapshots] = await Promise.all([
      prisma.player_profiles.findMany({
        where: { steamId: { in: steamIds } }
      }),
      prisma.player_stats.findMany({
        where: { steamId: { in: steamIds } }
      }),
      prisma.player_stats_snapshots.findMany({
        where: {
          steamId: { in: steamIds },
          snapshotDate: new Date() // 获取今日 00:00 的快照
        }
      })
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
        vacBanned: profile?.vacBanned || false,
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
    console.error('获取增强队伍信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
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
    const server = await prisma.servers.findFirst({
      where: { id: serverId, userId }
    });
    if (!server) {
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
    const extendedRecords = await prisma.extended_teammates.findMany({
      where: { userId, serverId }
    });
    const extendedSteamIds = new Set(extendedRecords.map(r => r.steamId));

    // 4. 合并：当前队伍中但不在 extended 表的，也要显示
    const allSteamIds = new Set([...extendedSteamIds, ...currentTeamMap.keys()]);

    if (allSteamIds.size === 0) {
      return res.json({ success: true, teammates: [] });
    }

    const steamIdArray = [...allSteamIds];

    // 5. 获取 Steam 资料和统计数据
    // 计算今天的日期范围
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [profiles, stats, todaySnapshots] = await Promise.all([
      prisma.player_profiles.findMany({
        where: { steamId: { in: steamIdArray } }
      }),
      prisma.player_stats.findMany({
        where: { steamId: { in: steamIdArray } }
      }),
      prisma.player_stats_snapshots.findMany({
        where: {
          steamId: { in: steamIdArray },
          snapshotDate: {
            gte: todayStart,
            lt: todayEnd
          }
        }
      })
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
        vacBanned: profile?.vacBanned || false,
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

    await prisma.extended_teammates.deleteMany({
      where: { userId, serverId, steamId }
    });

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

    await prisma.extended_teammates.updateMany({
      where: { userId, serverId, steamId },
      data: { notes }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/player-stats/:steamId
 * 获取玩家详细统计数据
 * - totalStats: 总数据
 * - todayContribution: 今日贡献（当前值 - 今日基准）
 * - todayHistory: 今日15分钟细粒度记录
 * - dailyHistory: 往日每天汇总
 */
router.get('/:id/player-stats/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    // 1. 获取玩家资料
    const profile = await prisma.player_profiles.findUnique({
      where: { steamId }
    });

    // 2. 获取当前总统计（实时值）
    const currentStats = await prisma.player_stats.findMany({
      where: { steamId }
    });

    // 3. 计算今日日期范围
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 4. 获取所有快照
    const allSnapshots = await prisma.player_stats_snapshots.findMany({
      where: { steamId },
      orderBy: { snapshotDate: 'asc' }
    });

    // 5. 分离今日快照和历史快照
    const todaySnapshots = allSnapshots.filter(s =>
      s.snapshotDate >= todayStart && s.snapshotDate <= todayEnd
    );
    const pastSnapshots = allSnapshots.filter(s =>
      s.snapshotDate < todayStart
    );

    // 6. 构建今日15分钟历史记录
    // 按时间分组快照
    const todayTimeGroups = {};
    todaySnapshots.forEach(snap => {
      const timeKey = snap.snapshotDate.toISOString();
      if (!todayTimeGroups[timeKey]) {
        todayTimeGroups[timeKey] = { time: snap.snapshotDate, stats: {} };
      }
      todayTimeGroups[timeKey].stats[snap.statKey] = snap.statValue;
    });

    // 转换为数组并计算增量
    const timeKeys = Object.keys(todayTimeGroups).sort();
    const todayHistory = [];

    for (let i = 0; i < timeKeys.length; i++) {
      const current = todayTimeGroups[timeKeys[i]];
      const prev = i > 0 ? todayTimeGroups[timeKeys[i - 1]] : null;

      const contribution = {};
      Object.keys(current.stats).forEach(key => {
        const prevValue = prev ? (prev.stats[key] || 0) : 0;
        const diff = current.stats[key] - prevValue;
        // 第一条记录不算贡献（是基准）
        if (diff > 0 && i > 0) {
          contribution[key] = diff;
        }
      });

      // 只添加有贡献的记录，或者是第一条（基准）
      if (Object.keys(contribution).length > 0 || i === 0) {
        todayHistory.push({
          snapshotDate: current.time,  // 修复：前端使用 snapshotDate
          stats: current.stats,
          contribution: i === 0 ? {} : contribution, // 第一条记录贡献为空
          isBaseline: i === 0
        });
      }
    }

    // 6.5 如果当前实时值与最后一个快照不同，添加"当前"记录到时间线
    const lastSnapshot = todayHistory.length > 0 ? todayHistory[todayHistory.length - 1] : null;
    if (lastSnapshot && currentStats.length > 0) {
      const currentStatsMap = {};
      currentStats.forEach(s => { currentStatsMap[s.statKey] = s.statValue; });

      // 计算当前值与最后快照的差异
      const currentContribution = {};
      Object.keys(currentStatsMap).forEach(key => {
        const lastValue = lastSnapshot.stats[key] || 0;
        const diff = currentStatsMap[key] - lastValue;
        if (diff > 0) {
          currentContribution[key] = diff;
        }
      });

      // 只有有变化时才添加当前记录
      if (Object.keys(currentContribution).length > 0) {
        todayHistory.push({
          snapshotDate: new Date(),
          stats: currentStatsMap,
          contribution: currentContribution,
          isBaseline: false,
          isCurrent: true  // 标记为当前实时数据
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
      // 记录每天最早和最晚的值
      if (!dailyData[dateKey].earliestTime || snap.snapshotDate < dailyData[dateKey].earliestTime) {
        dailyData[dateKey].earliest[snap.statKey] = snap.statValue;
        dailyData[dateKey].earliestTime = snap.snapshotDate;
      }
      if (!dailyData[dateKey].latestTime || snap.snapshotDate > dailyData[dateKey].latestTime) {
        dailyData[dateKey].latest[snap.statKey] = snap.statValue;
        dailyData[dateKey].latestTime = snap.snapshotDate;
      }
    });

    // 计算每日贡献（当天最晚值 - 当天最早值）
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

    // 8. 计算今日贡献（当前实时值 - 今日基准快照）
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
          vacBanned: profile.vacBanned,
          gameBans: profile.gameBans,
          lastUpdated: profile.lastUpdated
        } : null,
        totalStats,
        todayContribution,
        todayHistory: todayHistory.reverse(), // 最新的在前面
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
 * 需要有效订阅
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

    // 尝试从缓存获取 oceanMargin，如果没有则先调用 getMap 填充缓存
    let oceanMargin = rustPlusService.getMapOceanMargin(req.params.id);
    if (oceanMargin === 0) {
      // 缓存中没有 oceanMargin，调用 getMap 获取（会自动缓存）
      try {
        const mapData = await rustPlusService.getMap(req.params.id);
        oceanMargin = mapData?.oceanMargin || 0;
      } catch (e) {
        // 获取失败则使用默认值
        oceanMargin = 500;
      }
    }

    const [markers, info] = await Promise.all([
      rustPlusService.getMapMarkers(req.params.id),
      rustPlusService.getServerInfo(req.params.id)
    ]);

    // 获取服务器的img字段(Battlemetrics地图缩略图)
    const server = await prisma.servers.findUnique({
      where: { id: req.params.id },
      select: { img: true }
    });

    res.json({
      success: true,
      markers,
      mapSize: info?.mapSize || 4500,
      monuments: info?.monuments || [],
      img: server?.img || null,
      oceanMargin
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/map-image
 * 获取地图图片 (JPG格式,来自Rust+ API)
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

    // 将Buffer转换为图片并返回
    const imageBuffer = Buffer.from(mapData.jpgImage);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600'); // 缓存1小时
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
 * 获取服务器的所有设备（包含实时状态）
 */
router.get('/:id/devices', async (req, res) => {
  try {
    // 先验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取设备列表
    const devices = await prisma.devices.findMany({
      where: {
        serverId: req.params.id
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // 检查服务器是否已连接，如果已连接则查询实时状态
    const rustPlusService = getUserRustPlusService(req.user.id);
    const isConnected = rustPlusService && rustPlusService.isConnected(req.params.id);

    // 转换为前端格式，并添加实时状态
    const devicesFormatted = await Promise.all(
      devices.map(async (device) => {
        let currentValue = false; // 默认为 false

        // 如果服务器已连接，查询实时状态
        if (isConnected) {
          try {
            const entityInfo = await rustPlusService.getEntityInfo(req.params.id, device.entityId);
            if (entityInfo && entityInfo.payload) {
              currentValue = entityInfo.payload.value || false;
            }
          } catch (error) {
            // 查询失败时使用默认值，不影响整体返回
            console.error(`获取设备 ${device.entityId} 状态失败:`, error.message);
          }
        }

        // 将 autoMode 枚举转换为数字
        const autoModeToNum = {
          'NONE': 0,
          'DAY_ON': 1,
          'NIGHT_ON': 2,
          'ALWAYS_ON': 3,
          'ALWAYS_OFF': 4,
          'ONLINE_ON': 7,
          'ONLINE_OFF': 8
        };

        return {
          id: device.id,
          entityId: device.entityId,
          name: device.name,
          type: device.type,
          command: device.command,
          message: device.message,
          autoMode: autoModeToNum[device.autoMode] ?? 0,
          isActive: device.isActive,
          reachable: device.reachable,
          lastTrigger: device.lastTrigger,
          createdAt: device.createdAt,
          currentValue  // 添加实时状态
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
 * 需要有效订阅
 */
router.post('/:id/devices', requireActiveSubscription, async (req, res) => {
  try {
    const { entityId, name, type } = req.body;
    const serverId = req.params.id;

    if (!entityId || !name) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 长度限制
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: '设备名称长度不能超过 100 字符' });
    }

    // entityId 类型验证
    const entityIdNum = parseInt(entityId);
    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 检查设备是否已存在
    const existing = await prisma.devices.findFirst({
      where: {
        serverId,
        entityId: entityIdNum
      }
    });

    if (existing) {
      return res.status(409).json({ success: false, error: '该设备已存在' });
    }

    // 验证设备类型
    const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
    const deviceType = type ? type.toUpperCase() : 'SWITCH';
    if (!validTypes.includes(deviceType)) {
      return res.status(400).json({ success: false, error: '无效的设备类型' });
    }

    // 创建设备
    const device = await prisma.devices.create({
      data: {
        serverId,
        entityId: entityIdNum,
        name,
        type: deviceType
      }
    });

    res.status(201).json({
      success: true,
      message: '设备添加成功',
      device: {
        id: device.id,
        entityId: device.entityId,
        name: device.name
      }
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
    const server = await prisma.servers.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找设备
    const device = await prisma.devices.findFirst({
      where: {
        serverId: id,
        entityId: entityIdNum
      }
    });

    if (!device) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const { name, type, command, message, auto_mode } = req.body;
    const updates = {};

    // 验证并添加更新字段
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 100) {
        return res.status(400).json({ success: false, error: '设备名称无效或过长' });
      }
      updates.name = name;
    }

    if (type !== undefined) {
      const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
      const deviceType = type.toUpperCase();
      if (!validTypes.includes(deviceType)) {
        return res.status(400).json({ success: false, error: '无效的设备类型' });
      }
      updates.type = deviceType;
    }

    if (command !== undefined) {
      if (command !== null && (typeof command !== 'string' || command.length > 50)) {
        return res.status(400).json({ success: false, error: '命令名称无效或过长' });
      }
      // 检查命令是否与内置命令冲突
      const builtInCommands = ['help', 'time', 'pop', 'team', 'online', 'afk', 'cargo', 'small', 'large', 'heli', 'events', 'history', 'shop', 'leader', 'tr'];
      if (command && builtInCommands.includes(command.toLowerCase())) {
        return res.status(400).json({ success: false, error: `命令名称 "${command}" 与内置命令冲突` });
      }
      updates.command = command || null;
    }

    // 处理警报消息
    if (message !== undefined) {
      if (message !== null && (typeof message !== 'string' || message.length > 255)) {
        return res.status(400).json({ success: false, error: '警报消息过长（最多255字符）' });
      }
      updates.message = message || null;
    }

    if (auto_mode !== undefined) {
      // 将数字映射到枚举
      const autoModeMap = {
        0: 'NONE',
        1: 'DAY_ON',
        2: 'NIGHT_ON',
        3: 'ALWAYS_ON',
        4: 'ALWAYS_OFF',
        7: 'ONLINE_ON',
        8: 'ONLINE_OFF'
      };

      const modeNum = parseInt(auto_mode);
      if (!(modeNum in autoModeMap)) {
        return res.status(400).json({ success: false, error: '自动化模式必须是 0-4 或 7-8' });
      }
      updates.autoMode = autoModeMap[modeNum];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: '没有提供有效的更新字段' });
    }

    // 更新设备
    await prisma.devices.update({
      where: { id: device.id },
      data: updates
    });

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
    const server = await prisma.servers.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找并删除设备
    const device = await prisma.devices.findFirst({
      where: {
        serverId: id,
        entityId: entityIdNum
      }
    });

    if (!device) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    await prisma.devices.delete({
      where: { id: device.id }
    });

    res.json({ success: true, message: '设备删除成功' });
  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/devices/:entityId/status
 * 获取设备实时状态（从 Rust+ 服务器查询）
 */
router.get('/:id/devices/:entityId/status', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 检查服务器是否连接
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
 * 检测所有设备的可达性，并可选择删除不可达的设备
 */
router.post('/:id/devices/check-reachability', async (req, res) => {
  try {
    const serverId = req.params.id;
    const { removeUnreachable = false } = req.body;

    // 验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 检查服务器是否连接
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService || !rustPlusService.isConnected(serverId)) {
      return res.status(400).json({ success: false, error: '服务器未连接，无法检测设备' });
    }

    // 获取所有设备
    const devices = await prisma.devices.findMany({
      where: { serverId }
    });

    if (devices.length === 0) {
      return res.json({ success: true, message: '没有设备需要检测', devices: [], unreachable: [] });
    }

    const unreachableDevices = [];
    const reachableDevices = [];

    // 逐个检测设备可达性
    for (const device of devices) {
      try {
        const info = await rustPlusService.getEntityInfo(serverId, device.entityId);
        if (info && info.payload !== undefined) {
          // 设备可达
          reachableDevices.push(device);
          if (!device.reachable) {
            await prisma.devices.update({
              where: { id: device.id },
              data: { reachable: true, updatedAt: new Date() }
            });
          }
        } else {
          throw new Error('无法获取设备信息');
        }
      } catch (error) {
        // 设备不可达
        unreachableDevices.push({
          id: device.id,
          entityId: device.entityId,
          name: device.name,
          type: device.type,
          error: error.message
        });

        // 更新可达状态
        await prisma.devices.update({
          where: { id: device.id },
          data: { reachable: false, updatedAt: new Date() }
        });
      }
    }

    // 如果需要删除不可达设备
    let removedCount = 0;
    if (removeUnreachable && unreachableDevices.length > 0) {
      const unreachableIds = unreachableDevices.map(d => d.id);
      await prisma.devices.deleteMany({
        where: { id: { in: unreachableIds } }
      });
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
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const limit = parseInt(req.query.limit) || 100;

    // 验证 limit 范围
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({ success: false, error: 'limit 必须在 1-1000 之间' });
    }

    // 获取事件日志
    const events = await prisma.event_logs.findMany({
      where: {
        serverId: req.params.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    // 转换为前端格式
    const eventsFormatted = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      eventData: event.eventData,
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
 * 获取 Battlemetrics 详细信息（从 public_servers 缓存读取）
 */
router.get('/:id/battlemetrics', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    let battlemetricsId = server.battlemetricsId;

    // 如果没有保存的 Battlemetrics ID，尝试查找并保存
    if (!battlemetricsId) {
      battlemetricsId = await battlemetricsService.searchServerByAddress(
        server.ip,
        server.port,
        server.name
      );

      if (battlemetricsId) {
        // 保存找到的 ID
        await prisma.servers.update({
          where: { id: req.params.id },
          data: { battlemetricsId }
        });
      } else {
        return res.status(404).json({
          success: false,
          error: '未找到 Battlemetrics 信息'
        });
      }
    }

    // 优先从 public_servers 缓存读取
    let bmInfo = await prisma.public_servers.findUnique({
      where: { battlemetricsId }
    });

    // 如果缓存不存在或数据太旧（超过 5 分钟），则实时获取
    const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
    const isStale = !bmInfo || (Date.now() - bmInfo.updatedAt.getTime() > CACHE_TTL);

    if (isStale) {
      // 实时获取并更新缓存
      const freshData = await battlemetricsService.getServerInfo(battlemetricsId);

      if (freshData) {
        // 更新或创建缓存
        bmInfo = await prisma.public_servers.upsert({
          where: { battlemetricsId },
          create: {
            battlemetricsId,
            name: freshData.name || 'Unknown',
            ip: freshData.ip,
            port: freshData.port,
            address: freshData.address,
            status: freshData.status || 'online',
            players: freshData.players || 0,
            maxPlayers: freshData.maxPlayers || 0,
            queuedPlayers: freshData.queuedPlayers || 0,
            rank: freshData.rank,
            fps: freshData.fps,
            fpsAvg: freshData.fpsAvg,
            uptime: freshData.uptime,
            entityCount: freshData.entityCount,
            map: freshData.map,
            mapSize: freshData.mapSize,
            seed: freshData.worldSeed,
            wipeTime: freshData.lastWipe ? new Date(freshData.lastWipe) : null,
            wipeCycle: freshData.wipeCycle,
            nextWipe: freshData.nextWipe ? new Date(freshData.nextWipe) : null,
            headerImage: freshData.headerImage,
            logoImage: freshData.logoImage,
            rustMapsUrl: freshData.rustMapsUrl,
            rustMapsThumbnail: freshData.rustMapsThumbnail,
            country: freshData.country,
            official: freshData.official || false,
            modded: freshData.modded || false,
            pve: freshData.pve || false,
            description: freshData.description,
            url: freshData.url
          },
          update: {
            name: freshData.name || 'Unknown',
            ip: freshData.ip,
            port: freshData.port,
            address: freshData.address,
            status: freshData.status || 'online',
            players: freshData.players || 0,
            maxPlayers: freshData.maxPlayers || 0,
            queuedPlayers: freshData.queuedPlayers || 0,
            rank: freshData.rank,
            fps: freshData.fps,
            fpsAvg: freshData.fpsAvg,
            uptime: freshData.uptime,
            entityCount: freshData.entityCount,
            map: freshData.map,
            mapSize: freshData.mapSize,
            seed: freshData.worldSeed,
            wipeTime: freshData.lastWipe ? new Date(freshData.lastWipe) : null,
            wipeCycle: freshData.wipeCycle,
            nextWipe: freshData.nextWipe ? new Date(freshData.nextWipe) : null,
            headerImage: freshData.headerImage,
            logoImage: freshData.logoImage,
            rustMapsUrl: freshData.rustMapsUrl,
            rustMapsThumbnail: freshData.rustMapsThumbnail,
            country: freshData.country,
            official: freshData.official || false,
            modded: freshData.modded || false,
            pve: freshData.pve || false,
            description: freshData.description,
            url: freshData.url
          }
        });
      }
    }

    if (!bmInfo) {
      return res.status(500).json({
        success: false,
        error: '获取 Battlemetrics 信息失败'
      });
    }

    res.json({ success: true, data: bmInfo });
  } catch (error) {
    console.error('获取 Battlemetrics 信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/battlemetrics/top-players
 * 获取服务器玩家排行（实时调用，不缓存）
 */
router.get('/:id/battlemetrics/top-players', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const server = await prisma.servers.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server || !server.battlemetricsId) {
      return res.status(404).json({
        success: false,
        error: '服务器不存在或未关联 Battlemetrics'
      });
    }

    const days = parseInt(req.query.days) || 30;

    // 验证 days 范围
    if (days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'days 必须在 1-365 之间' });
    }

    const players = await battlemetricsService.getTopPlayers(server.battlemetricsId, days);

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
 * 获取 Rust+ 连接设置
 */
router.get('/settings/connection', (req, res) => {
  try {
    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.status(400).json({ success: false, error: '用户服务未初始化' });
    }

    res.json({
      success: true,
      settings: {
        useFacepunchProxy: rustPlusService.useFacepunchProxy,
        description: rustPlusService.useFacepunchProxy
          ? '通过 Facepunch 官方代理 (wss://companion-rust.facepunch.com)'
          : '直连游戏服务器 (ws://IP:PORT)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/settings/connection
 * 设置 Rust+ 连接模式
 */
router.post('/settings/connection', (req, res) => {
  try {
    const { useFacepunchProxy } = req.body;

    if (typeof useFacepunchProxy !== 'boolean') {
      return res.status(400).json({ success: false, error: 'useFacepunchProxy 必须是布尔值' });
    }

    const rustPlusService = getUserRustPlusService(req.user.id);
    if (!rustPlusService) {
      return res.status(400).json({ success: false, error: '用户服务未初始化' });
    }

    rustPlusService.setUseFacepunchProxy(useFacepunchProxy);

    res.json({
      success: true,
      message: useFacepunchProxy
        ? '已切换到 Facepunch 代理模式（需要重新连接服务器生效）'
        : '已切换到直连模式（需要重新连接服务器生效）',
      settings: {
        useFacepunchProxy: rustPlusService.useFacepunchProxy
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
