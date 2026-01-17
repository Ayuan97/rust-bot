/**
 * 设置相关路由（多租户版本）
 * 每个用户独立的通知设置
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.middleware.js';
import globalManager from '../services/global-manager.service.js';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  // 玩家通知
  player_death: true,
  player_online: true,
  player_offline: true,
  player_afk: true,
  player_afk_minutes: 3,        // AFK 触发时间（分钟），默认 3 分钟
  player_afk_message: '',       // AFK 自定义话术（空则使用默认）

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
  vending_new: false,

  // 昼夜提醒
  day_night_enabled: true,      // 是否启用昼夜提醒
  day_notify_minutes: 5,        // 天亮前几分钟开始提醒
  night_notify_minutes: 8,      // 天黑前几分钟开始提醒
};

/**
 * GET /api/settings/notifications
 * 获取当前用户的通知设置
 */
router.get('/notifications', async (req, res) => {
  try {
    // 查找或创建用户的通知设置
    let notificationSettings = await prisma.notification_settings.findUnique({
      where: { userId: req.user.id }
    });

    // 如果不存在，创建默认设置
    if (!notificationSettings) {
      notificationSettings = await prisma.notification_settings.create({
        data: {
          userId: req.user.id,
          settings: DEFAULT_NOTIFICATION_SETTINGS
        }
      });
    }

    // 合并默认设置和已保存的设置
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(typeof notificationSettings.settings === 'object' ? notificationSettings.settings : {})
    };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ 获取通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/notifications
 * 更新当前用户的通知设置（部分更新）
 */
router.post('/notifications', async (req, res) => {
  try {
    const partialSettings = req.body;

    // 查找或创建用户的通知设置
    let notificationSettings = await prisma.notification_settings.findUnique({
      where: { userId: req.user.id }
    });

    if (!notificationSettings) {
      // 创建新设置
      notificationSettings = await prisma.notification_settings.create({
        data: {
          userId: req.user.id,
          settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...partialSettings }
        }
      });
    } else {
      // 更新现有设置（合并）
      const currentSettings = typeof notificationSettings.settings === 'object'
        ? notificationSettings.settings
        : {};

      notificationSettings = await prisma.notification_settings.update({
        where: { userId: req.user.id },
        data: {
          settings: { ...currentSettings, ...partialSettings }
        }
      });
    }

    // 合并默认设置
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(typeof notificationSettings.settings === 'object' ? notificationSettings.settings : {})
    };

    // 刷新服务中的缓存（如果用户服务正在运行）
    const userService = globalManager.getUserService(req.user.id);
    if (userService) {
      // 刷新事件监控服务的通知设置缓存
      if (userService.eventMonitorService) {
        await userService.eventMonitorService.loadNotificationSettings();
      }
      // 刷新昼夜提醒服务的设置缓存
      if (userService.dayNightNotifier) {
        await userService.dayNightNotifier.loadNotificationSettings();
      }
      console.log(`✅ 用户 ${req.user.id} 的通知设置缓存已刷新`);
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ 更新通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/notifications/reset
 * 重置当前用户的通知设置为默认值
 */
router.post('/notifications/reset', async (req, res) => {
  try {
    // 更新或创建默认设置
    await prisma.notification_settings.upsert({
      where: { userId: req.user.id },
      update: {
        settings: DEFAULT_NOTIFICATION_SETTINGS
      },
      create: {
        userId: req.user.id,
        settings: DEFAULT_NOTIFICATION_SETTINGS
      }
    });

    // 刷新服务中的缓存（如果用户服务正在运行）
    const userService = globalManager.getUserService(req.user.id);
    if (userService) {
      if (userService.eventMonitorService) {
        await userService.eventMonitorService.loadNotificationSettings();
      }
      if (userService.dayNightNotifier) {
        await userService.dayNightNotifier.loadNotificationSettings();
      }
      console.log(`✅ 用户 ${req.user.id} 的通知设置已重置并刷新缓存`);
    }

    res.json({ success: true, settings: DEFAULT_NOTIFICATION_SETTINGS });
  } catch (error) {
    console.error('❌ 重置通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取通知设置的辅助函数（供其他服务使用）
 * @param {string} userId - 用户 ID
 * @returns {Promise<object>} 通知设置对象
 */
export async function getNotificationSettings(userId) {
  try {
    const notificationSettings = await prisma.notification_settings.findUnique({
      where: { userId }
    });

    if (!notificationSettings) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(typeof notificationSettings.settings === 'object' ? notificationSettings.settings : {})
    };
  } catch (error) {
    console.error('获取通知设置失败:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * 检查某个通知是否启用
 * @param {string} userId - 用户 ID
 * @param {string} key - 通知键名
 * @returns {Promise<boolean>} 是否启用
 */
export async function isNotificationEnabled(userId, key) {
  const settings = await getNotificationSettings(userId);
  return settings[key] !== false; // 默认启用
}

export default router;
