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
 * 获取追踪玩家列表
 * GET /api/tracking
 */
router.get('/', async (req, res) => {
  try {
    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const players = await userService.trackingService.getTrackedPlayers();
    const groups = await userService.trackingService.getGroups();

    res.json({
      success: true,
      players,
      groups,
      status: userService.trackingService.getStatus()
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

    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const result = await userService.trackingService.addTrackedPlayer(steamId, {
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
    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const groups = await userService.trackingService.getGroups();

    res.json({ success: true, groups });
  } catch (error) {
    console.error('获取分组列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
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

    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const history = await userService.trackingService.getPlayerHistory(steamId, limit);

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

    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const player = await userService.trackingService.getTrackedPlayer(steamId);
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

    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    const result = await userService.trackingService.updateTrackedPlayer(steamId, {
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

    const userService = globalServiceManager.getUserService(req.userId);
    if (!userService || !userService.trackingService) {
      return res.status(503).json({ success: false, error: '追踪服务未初始化' });
    }

    await userService.trackingService.removeTrackedPlayer(steamId);

    res.json({ success: true });
  } catch (error) {
    console.error('删除追踪玩家失败:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
