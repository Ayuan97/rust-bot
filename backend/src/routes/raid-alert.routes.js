/**
 * 突袭警报通知路由
 * - 通知人管理（多人，每人独立启用开关 = 单人真·关闭）
 * - 总开关：临时静音(6h自动恢复) / 彻底关闭 / 恢复
 */

import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import notificationService from '../services/notification.service.js';

const router = express.Router();
router.use(authenticate);

// 状态（总开关模式 + 配置）
router.get('/status', async (req, res) => {
  try {
    const status = await notificationService.getStatus(req.user.id);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 通知人列表
router.get('/recipients', async (req, res) => {
  try {
    const recipients = await notificationService.listRecipients(req.user.id);
    res.json({ success: true, recipients });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 添加通知人
router.post('/recipients', async (req, res) => {
  try {
    const { name, barkKey, barkServer } = req.body || {};
    if (!name || !barkKey) {
      return res.status(400).json({ success: false, error: '缺少名字或 Bark Key' });
    }
    const id = await notificationService.addRecipient(req.user.id, { name, barkKey, barkServer });
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 更新通知人（改名 / 改 key / 启用开关——单人真·关闭就是把 enabled 设 false）
router.patch('/recipients/:id', async (req, res) => {
  try {
    const ok = await notificationService.updateRecipient(req.user.id, req.params.id, req.body || {});
    if (!ok) return res.status(404).json({ success: false, error: '通知人不存在或无更新内容' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 删除通知人
router.delete('/recipients/:id', async (req, res) => {
  try {
    const ok = await notificationService.deleteRecipient(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: '通知人不存在' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 测试发送（用户配完点"测试"）
router.post('/recipients/:id/test', async (req, res) => {
  try {
    const ok = await notificationService.testRecipient(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: '通知人不存在' });
    res.json({ success: true, message: '测试通知已发送' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 临时静音（默认 6 小时后自动恢复）
router.post('/snooze', async (req, res) => {
  try {
    const result = await notificationService.snooze(req.user.id, req.body?.hours);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 彻底关闭（手动恢复前不再通知）
router.post('/disable', async (req, res) => {
  try {
    const result = await notificationService.disable(req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 恢复正常
router.post('/activate', async (req, res) => {
  try {
    const result = await notificationService.activate(req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
