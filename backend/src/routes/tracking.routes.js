/**
 * 玩家追踪 API 路由
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import globalServiceManager from '../services/global-manager.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 获取或创建用户的追踪服务
 * @param {string} userId - 用户 ID
 * @returns {Promise<object | null>} trackingService 或 null
 */
async function getTrackingService(userId) {
  let userService = globalServiceManager.getUserService(userId);

  // 如果用户服务不存在，尝试创建
  if (!userService) {
    try {
      userService = await globalServiceManager.createUserService(userId);
    } catch (error) {
      console.error(`创建用户服务失败: ${error.message}`);
      return null;
    }
  }

  if (!userService || !userService.trackingService) {
    return null;
  }

  return userService.trackingService;
}

/**
 * 获取追踪玩家列表
 * GET /api/tracking
 */
router.get('/', async (req, res) => {
  try {
    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const players = await trackingService.getTrackedPlayers();
    const groups = await trackingService.getGroups();

    res.json({
      success: true,
      players,
      groups,
      status: trackingService.getStatus()
    });
  } catch (error) {
    console.error('获取追踪列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加追踪玩家
 * POST /api/tracking
 * Body: { steamId, groupName?, notes?, priority? }
 */
router.post('/', async (req, res) => {
  try {
    const { steamId, groupName, notes, priority } = req.body;

    if (!steamId) {
      return res.status(400).json({ success: false, error: '缺少 steamId' });
    }

    // 验证 Steam ID 格式 (17位数字)
    if (!/^\d{17}$/.test(steamId)) {
      return res.status(400).json({ success: false, error: 'Steam ID 格式无效 (应为17位数字)' });
    }

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const result = await trackingService.addTrackedPlayer(steamId, {
      groupName,
      notes,
      priority
    });

    res.json({ success: true, player: result });
  } catch (error) {
    console.error('添加追踪玩家失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 获取分组列表
 * GET /api/tracking/groups
 * 注意: 必须在 /:steamId 路由之前定义，否则会被拦截
 */
router.get('/groups', async (req, res) => {
  try {
    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const groups = await trackingService.getGroups();

    res.json({ success: true, groups });
  } catch (error) {
    console.error('获取分组列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 通过 Battlemetrics 玩家 ID 添加追踪
 * POST /api/tracking/by-bmid
 * Body: { bmPlayerId, playerName?, groupName?, notes?, priority? }
 * 注意: 必须在 /:steamId 路由之前定义
 */
router.post('/by-bmid', async (req, res) => {
  try {
    const { bmPlayerId, playerName, groupName, notes, priority } = req.body;

    if (!bmPlayerId) {
      return res.status(400).json({ success: false, error: '缺少 bmPlayerId' });
    }

    // 尝试获取 Steam ID，如果获取不到就用 BM ID 作为标识
    let steamId = await battlemetricsService.getPlayerSteamId(bmPlayerId);

    if (!steamId) {
      // 用 BM_ 前缀 + BM玩家ID 作为标识
      steamId = `BM_${bmPlayerId}`;
      console.log(`[TRACKING] 无法获取玩家 ${bmPlayerId} 的 Steam ID，使用 BM ID 作为标识: ${steamId}`);
    }

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const result = await trackingService.addTrackedPlayer(steamId, {
      groupName,
      notes: notes || (playerName ? `从在线列表添加: ${playerName}` : null),
      priority,
      battlemetricsId: bmPlayerId,  // 直接传入 BM ID
      playerName  // 传入玩家名称
    });

    res.json({ success: true, player: result });
  } catch (error) {
    console.error('通过 BM ID 添加追踪失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 通过 Steam ID 预览玩家信息 (不添加追踪)
 * GET /api/tracking/preview/:steamId
 * 注意: 必须在 /:steamId 路由之前定义，否则会被拦截
 */
router.get('/preview/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    // 验证 Steam ID 格式 (17位数字)
    if (!/^\d{17}$/.test(steamId)) {
      return res.status(400).json({ success: false, error: 'Steam ID 格式无效 (应为17位数字)' });
    }

    // 尝试从 Battlemetrics 获取玩家信息
    const playerInfo = await battlemetricsService.getPlayerBySteamId(steamId);

    if (!playerInfo) {
      return res.json({
        success: true,
        found: false,
        message: '在 Battlemetrics 中未找到该玩家'
      });
    }

    res.json({
      success: true,
      found: true,
      player: {
        steamId,
        battlemetricsId: playerInfo.id,
        name: playerInfo.name,
        isOnline: playerInfo.online,
        server: playerInfo.server,
        session: playerInfo.session
      }
    });
  } catch (error) {
    console.error('预览玩家信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取玩家活动历史
 * GET /api/tracking/:steamId/history
 * Query: { limit? }
 */
router.get('/:steamId/history', async (req, res) => {
  try {
    const { steamId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const history = await trackingService.getPlayerHistory(steamId, limit);

    res.json({ success: true, history });
  } catch (error) {
    console.error('获取玩家历史失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取玩家详细资料 (包括历史名称)
 * GET /api/tracking/:steamId/profile
 */
router.get('/:steamId/profile', async (req, res) => {
  try {
    const { steamId } = req.params;

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const player = await trackingService.getTrackedPlayer(steamId);
    if (!player) {
      return res.status(404).json({ success: false, error: '玩家不在追踪列表中' });
    }

    res.json({ success: true, player });
  } catch (error) {
    console.error('获取玩家资料失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新追踪玩家
 * PUT /api/tracking/:steamId
 * Body: { groupName?, notes?, priority?, isActive? }
 */
router.put('/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    const { groupName, notes, priority, isActive } = req.body;

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    const result = await trackingService.updateTrackedPlayer(steamId, {
      groupName,
      notes,
      priority,
      isActive
    });

    res.json({ success: true, player: result });
  } catch (error) {
    console.error('更新追踪玩家失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 删除追踪玩家
 * DELETE /api/tracking/:steamId
 */
router.delete('/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    const trackingService = await getTrackingService(req.user.id);
    if (!trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化，请检查订阅状态' });
    }

    await trackingService.removeTrackedPlayer(steamId);

    res.json({ success: true });
  } catch (error) {
    console.error('删除追踪玩家失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
