/**
 * 设置相关路由
 */

import { Router } from 'express';
import storage from '../models/storage.model.js';

const router = Router();

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  // 玩家通知
  player_death: true,
  player_online: true,
  player_offline: true,
  player_afk: true,

  // 货船通知
  cargo_spawn: true,
  cargo_dock: true,
  cargo_egress: true,
  cargo_leave: false,

  // 直升机通知
  heli_spawn: true,
  heli_downed: true,
  heli_leave: false,

  // 油井通知
  oil_rig_triggered: true,
  oil_rig_warning: true,
  oil_rig_unlocked: true,

  // 其他事件
  crate_spawn: false,
  ch47_spawn: false,
  raid_detected: true,
  vending_new: false,

  // 昼夜提醒
  day_night_enabled: true,      // 是否启用昼夜提醒
  day_notify_minutes: 5,        // 天亮前几分钟开始提醒
  night_notify_minutes: 8,      // 天黑前几分钟开始提醒
};

/**
 * GET /api/settings/notifications
 * 获取通知设置
 */
router.get('/notifications', (req, res) => {
  try {
    const saved = storage.getNotificationSettings();
    // 合并默认设置和已保存的设置
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };
    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ 获取通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/notifications
 * 更新通知设置（部分更新）
 */
router.post('/notifications', (req, res) => {
  try {
    const partialSettings = req.body;
    storage.updateNotificationSettings(partialSettings);

    const updated = storage.getNotificationSettings();
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...updated };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ 更新通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/notifications/reset
 * 重置通知设置为默认值
 */
router.post('/notifications/reset', (req, res) => {
  try {
    storage.resetNotificationSettings();
    res.json({ success: true, settings: DEFAULT_NOTIFICATION_SETTINGS });
  } catch (error) {
    console.error('❌ 重置通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取通知设置的辅助函数（供其他服务使用）
 */
export function getNotificationSettings() {
  const saved = storage.getNotificationSettings();
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };
}

/**
 * 检查某个通知是否启用
 */
export function isNotificationEnabled(key) {
  const settings = getNotificationSettings();
  return settings[key] !== false; // 默认启用
}

export default router;
