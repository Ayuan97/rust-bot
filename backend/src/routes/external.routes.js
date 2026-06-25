/**
 * 外部接口路由 —— 用用户专属 apiToken 鉴权（不走 JWT），供外部系统调用。
 * - POST /api/external/bark：外部触发 Bark 推送，标题/内容自定义，推给该用户已配置的所有 Bark 通知人。
 */
import express from 'express';
import notificationService from '../services/notification.service.js';

const router = express.Router();

// 从请求多个位置取 apiToken：Authorization: Bearer xxx / X-Api-Token / ?token= / body.token
function pickToken(req) {
  const auth = req.headers['authorization'] || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return req.headers['x-api-token'] || req.query.token || (req.body && req.body.token) || '';
}

// POST /api/external/bark  body: { title, body }  -> 推给该用户已配置且启用的所有 Bark 通知人
router.post('/bark', async (req, res) => {
  try {
    const token = pickToken(req);
    const userId = await notificationService.getUserIdByApiToken(token);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'API token 无效或缺失' });
    }
    const title = String(req.body?.title || '通知').slice(0, 100);
    const body = String(req.body?.body ?? req.body?.message ?? '').slice(0, 500);
    const result = await notificationService.sendCustom(userId, title, body);
    if (result.sent === 0) {
      return res.json({ success: true, sent: 0, message: '未配置启用的 Bark 通知人' });
    }
    res.json({ success: true, sent: result.sent });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
