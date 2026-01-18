/**
 * 预测系统路由
 * 提供事件预测和学习模式的 API
 */

import express from 'express';
import { authenticate, requireActiveSubscription } from '../middleware/auth.middleware.js';
import globalServiceManager from '../services/global-manager.service.js';
import db from '../lib/db.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 获取用户的预测服务实例
 */
function getPredictionService(userId) {
  const userService = globalServiceManager.getUserService(userId);
  if (!userService || !userService.predictionService) {
    return null;
  }
  return userService.predictionService;
}

/**
 * 验证服务器归属
 */
async function validateServer(serverId, userId) {
  const [rows] = await db.query(
    'SELECT id FROM servers WHERE id = ? AND userId = ?',
    [serverId, userId]
  );
  return rows[0] || null;
}

// ============================================================
// 预测接口
// ============================================================

/**
 * GET /api/predictions/:serverId
 * 获取服务器的当前活跃预测
 */
router.get('/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    // 验证服务器归属
    const server = await validateServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取预测服务
    const predictionService = getPredictionService(userId);
    if (!predictionService) {
      return res.status(400).json({ success: false, error: '服务未启动' });
    }

    const predictions = await predictionService.getActivePredictions(serverId);

    res.json({
      success: true,
      predictions
    });
  } catch (error) {
    console.error('获取预测失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/predictions/:serverId/patterns
 * 获取服务器的学习模式数据
 */
router.get('/:serverId/patterns', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    // 验证服务器归属
    const server = await validateServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取预测服务
    const predictionService = getPredictionService(userId);
    if (!predictionService) {
      return res.status(400).json({ success: false, error: '服务未启动' });
    }

    const patterns = await predictionService.getPatterns(serverId);

    res.json({
      success: true,
      patterns,
      minSamples: 5  // 告知前端最小样本数要求
    });
  } catch (error) {
    console.error('获取学习模式失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/predictions/:serverId/patterns/reset
 * 重置服务器的学习数据（清档后使用）
 * 需要有效订阅
 */
router.post('/:serverId/patterns/reset', requireActiveSubscription, async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    // 验证服务器归属
    const server = await validateServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取预测服务
    const predictionService = getPredictionService(userId);
    if (!predictionService) {
      return res.status(400).json({ success: false, error: '服务未启动' });
    }

    const success = await predictionService.resetPatterns(serverId);

    if (success) {
      res.json({
        success: true,
        message: '学习数据已重置'
      });
    } else {
      res.status(500).json({
        success: false,
        error: '重置失败'
      });
    }
  } catch (error) {
    console.error('重置学习数据失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/predictions/:serverId/history
 * 获取预测历史记录（用于分析准确率）
 */
router.get('/:serverId/history', async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    // 验证服务器归属
    const server = await validateServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取历史预测（用户级别）
    const [predictions] = await db.query(
      `SELECT * FROM event_predictions
       WHERE serverId = ? AND userId = ? AND status IN ('OCCURRED', 'MISSED', 'NOTIFIED')
       ORDER BY createdAt DESC
       LIMIT ?`,
      [serverId, userId, limit]
    );

    // 计算统计数据
    const stats = {
      total: predictions.length,
      occurred: predictions.filter(p => p.status === 'OCCURRED').length,
      missed: predictions.filter(p => p.status === 'MISSED').length,
      notified: predictions.filter(p => p.status === 'NOTIFIED').length
    };

    // 计算准确率（发生的预测占总预测的比例）
    const accuracy = stats.total > 0
      ? ((stats.occurred / stats.total) * 100).toFixed(1)
      : null;

    res.json({
      success: true,
      predictions: predictions.map(p => ({
        id: p.id,
        eventType: p.eventType,
        predictedTime: p.predictedTime,
        actualTime: p.actualTime,
        confidenceLevel: p.confidenceLevel,
        status: p.status,
        createdAt: p.createdAt
      })),
      stats: {
        ...stats,
        accuracy
      }
    });
  } catch (error) {
    console.error('获取预测历史失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
