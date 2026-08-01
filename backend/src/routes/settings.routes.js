/**
 * 设置相关路由（多租户版本）
 * 每个用户独立的通知设置
 */

import { Router } from 'express';
import db from '../lib/db.js';
import { authenticate, requireApprovedAccount } from '../middleware/auth.middleware.js';
import globalManager from '../services/global-manager.service.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 所有路由都需要认证
router.use(authenticate, requireApprovedAccount);

// AFK 消息模板默认值
const DEFAULT_AFK_TEMPLATE = '`{name}` 在 {position} 已挂机 {minutes} 分钟';

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  // 玩家通知
  player_death: true,
  player_online: true,
  player_offline: true,
  player_joined_team: true,
  player_left_team: true,
  player_afk: true,
  player_afk_minutes: 3,        // AFK 触发时间（分钟），默认 3 分钟
  player_afk_template: '',      // AFK 消息模板（空则使用默认）
  player_afk_return: true,      // AFK 返回通知启用
  player_afk_return_template: '', // AFK 返回消息模板

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

  // 坦克通知
  bradley_destroyed: true,
  bradley_crate: true,
  bradley_respawn: true,

  // 昼夜提醒
  day_night_enabled: true,      // 是否启用昼夜提醒
  day_notify_minutes: 5,        // 天亮前几分钟开始提醒
  night_notify_minutes: 8,      // 天黑前几分钟开始提醒

  // 游戏内命令
  cmd_help: true,
  cmd_time: true,
  cmd_pop: true,
  cmd_team: true,
  cmd_online: true,
  cmd_afk: true,
  cmd_cargo: true,
  cmd_heli: true,
  cmd_small: true,
  cmd_large: true,
  cmd_shop: true,
  cmd_tr: true,
  cmd_trf: true,
  cmd_leader: true,
};

/**
 * GET /api/settings/notifications
 * 获取当前用户的通知设置
 */
router.get('/notifications', async (req, res) => {
  try {
    // 查找用户的通知设置
    const [rows] = await db.query(
      'SELECT * FROM notification_settings WHERE userId = ?',
      [req.user.id]
    );

    let notificationSettings = rows[0];

    // 如果不存在，创建默认设置
    if (!notificationSettings) {
      const id = uuidv4();
      const now = new Date();
      await db.query(
        `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [id, req.user.id, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, now]
      );
      notificationSettings = { settings: DEFAULT_NOTIFICATION_SETTINGS };
    }

    // 解析 JSON settings
    const savedSettings = typeof notificationSettings.settings === 'string'
      ? JSON.parse(notificationSettings.settings)
      : (notificationSettings.settings || {});

    // 合并默认设置和已保存的设置
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...savedSettings
    };

    res.json({ success: true, settings });
  } catch (error) {
    console.error('获取通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 验证 AFK 消息模板
 * @param {string} template - 用户输入的模板
 * @returns {{ valid: boolean, error?: string }} 验证结果
 */
function validateAfkTemplate(template) {
  // 空字符串表示使用默认模板，合法
  if (!template || !template.trim()) {
    return { valid: true };
  }

  const trimmed = template.trim();

  // 必须包含 {name} 变量
  if (!trimmed.includes('{name}')) {
    return { valid: false, error: 'AFK 模板必须包含 {name} 变量' };
  }

  // 检查是否只包含合法变量
  const allowedVars = ['{name}', '{position}', '{minutes}', '{duration}'];
  const varPattern = /\{[^}]+\}/g;
  const foundVars = trimmed.match(varPattern) || [];

  for (const v of foundVars) {
    if (!allowedVars.includes(v)) {
      return { valid: false, error: `不支持的变量: ${v}，仅支持 {name}, {position}, {minutes}, {duration}` };
    }
  }

  return { valid: true };
}

/**
 * 验证 AFK 返回消息模板
 * @param {string} template - 用户输入的模板
 * @returns {{ valid: boolean, error?: string }} 验证结果
 */
function validateAfkReturnTemplate(template) {
  // 空字符串表示使用默认模板，合法
  if (!template || !template.trim()) {
    return { valid: true };
  }

  const trimmed = template.trim();

  // 必须包含 {name} 变量
  if (!trimmed.includes('{name}')) {
    return { valid: false, error: 'AFK 返回模板必须包含 {name} 变量' };
  }

  // 检查是否只包含合法变量
  const allowedVars = ['{name}', '{minutes}', '{duration}'];
  const varPattern = /\{[^}]+\}/g;
  const foundVars = trimmed.match(varPattern) || [];

  for (const v of foundVars) {
    if (!allowedVars.includes(v)) {
      return { valid: false, error: `不支持的变量: ${v}，仅支持 {name}, {minutes}, {duration}` };
    }
  }

  return { valid: true };
}

/**
 * POST /api/settings/notifications
 * 更新当前用户的通知设置（部分更新）
 */
router.post('/notifications', async (req, res) => {
  try {
    const partialSettings = req.body;

    // 验证 AFK 模板（如果包含在请求中）
    if ('player_afk_template' in partialSettings) {
      const validation = validateAfkTemplate(partialSettings.player_afk_template);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }
      // 清理：去除首尾空格
      if (partialSettings.player_afk_template) {
        partialSettings.player_afk_template = partialSettings.player_afk_template.trim();
      }
    }

    // 验证 AFK 返回模板（如果包含在请求中）
    if ('player_afk_return_template' in partialSettings) {
      const validation = validateAfkReturnTemplate(partialSettings.player_afk_return_template);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }
      // 清理：去除首尾空格
      if (partialSettings.player_afk_return_template) {
        partialSettings.player_afk_return_template = partialSettings.player_afk_return_template.trim();
      }
    }

    // 验证 AFK 分钟数
    if ('player_afk_minutes' in partialSettings) {
      const minutes = partialSettings.player_afk_minutes;
      if (typeof minutes !== 'number' || minutes < 1 || minutes > 30) {
        return res.status(400).json({ success: false, error: 'AFK 触发时间必须在 1-30 分钟之间' });
      }
    }

    // 查找用户的通知设置
    const [rows] = await db.query(
      'SELECT * FROM notification_settings WHERE userId = ?',
      [req.user.id]
    );

    let notificationSettings = rows[0];
    const now = new Date();

    if (!notificationSettings) {
      // 创建新设置
      const id = uuidv4();
      const newSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...partialSettings };
      await db.query(
        `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [id, req.user.id, JSON.stringify(newSettings), now, now]
      );
      notificationSettings = { settings: newSettings };
    } else {
      // 更新现有设置（合并）
      const currentSettings = typeof notificationSettings.settings === 'string'
        ? JSON.parse(notificationSettings.settings)
        : (notificationSettings.settings || {});

      const mergedSettings = { ...currentSettings, ...partialSettings };

      await db.query(
        'UPDATE notification_settings SET settings = ?, updatedAt = ? WHERE userId = ?',
        [JSON.stringify(mergedSettings), now, req.user.id]
      );
      notificationSettings = { settings: mergedSettings };
    }

    // 解析设置
    const savedSettings = typeof notificationSettings.settings === 'string'
      ? JSON.parse(notificationSettings.settings)
      : notificationSettings.settings;

    // 合并默认设置
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...savedSettings
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
      // 刷新命令服务的设置缓存
      if (userService.commandsService) {
        await userService.commandsService.loadCommandSettings();
      }
      console.log(`[Settings] 用户 ${req.user.id} 的通知设置缓存已刷新`);
    }

    res.json({ success: true, settings });
  } catch (error) {
    console.error('更新通知设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/settings/notifications/reset
 * 重置当前用户的通知设置为默认值
 */
router.post('/notifications/reset', async (req, res) => {
  try {
    const now = new Date();

    // 使用 INSERT ON DUPLICATE KEY UPDATE 实现 upsert
    const [existingRows] = await db.query(
      'SELECT id FROM notification_settings WHERE userId = ?',
      [req.user.id]
    );

    if (existingRows.length > 0) {
      await db.query(
        'UPDATE notification_settings SET settings = ?, updatedAt = ? WHERE userId = ?',
        [JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, req.user.id]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO notification_settings (id, userId, settings, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [id, req.user.id, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS), now, now]
      );
    }

    // 刷新服务中的缓存（如果用户服务正在运行）
    const userService = globalManager.getUserService(req.user.id);
    if (userService) {
      if (userService.eventMonitorService) {
        await userService.eventMonitorService.loadNotificationSettings();
      }
      if (userService.dayNightNotifier) {
        await userService.dayNightNotifier.loadNotificationSettings();
      }
      // 刷新命令服务的设置缓存
      if (userService.commandsService) {
        await userService.commandsService.loadCommandSettings();
      }
      console.log(`[Settings] 用户 ${req.user.id} 的通知设置已重置并刷新缓存`);
    }

    res.json({ success: true, settings: DEFAULT_NOTIFICATION_SETTINGS });
  } catch (error) {
    console.error('重置通知设置失败:', error);
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
    const [rows] = await db.query(
      'SELECT settings FROM notification_settings WHERE userId = ?',
      [userId]
    );

    if (rows.length === 0) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    const savedSettings = typeof rows[0].settings === 'string'
      ? JSON.parse(rows[0].settings)
      : (rows[0].settings || {});

    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...savedSettings
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
