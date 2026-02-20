/**
 * FCM 配对路由（多租户版本）
 * 所有操作都需要认证并与用户 ID 关联
 */

import express from 'express';
import db from '../lib/db.js';
import { authenticate, requireActiveSubscription } from '../middleware/auth.middleware.js';
import globalServiceManager from '../services/global-manager.service.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 获取用户的 FCM 服务实例
 * @param {string} userId - 用户 ID
 * @returns {Object|null} UserFCMManager 实例
 */
function getUserFCMService(userId) {
  const userService = globalServiceManager.getUserService(userId);
  if (!userService) {
    return null;
  }
  return userService.fcmService;
}

/**
 * GET /api/pairing/status
 * 获取 FCM 配对状态
 */
router.get('/status', async (req, res) => {
  try {
    const fcmService = getUserFCMService(req.user.id);

    if (!fcmService) {
      return res.json({
        success: true,
        status: {
          isListening: false,
          hasCredentials: false,
          message: '用户服务未初始化'
        }
      });
    }

    // 检查是否有保存的凭证（从数据库）
    const [servers] = await db.query(
      `SELECT fcmCredentials FROM servers
       WHERE userId = ? AND fcmCredentials IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );

    const hasStoredCredentials = servers.length > 0 && servers[0].fcmCredentials;

    res.json({
      success: true,
      status: {
        isListening: fcmService.isListening || false,
        hasCredentials: hasStoredCredentials,
        hasStoredCredentials: hasStoredCredentials, // 兼容前端
        credentialType: hasStoredCredentials ? 'GCM' : null
      }
    });
  } catch (error) {
    console.error('获取配对状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pairing/start
 * 开始 FCM 监听
 * 需要有效订阅
 */
router.post('/start', requireActiveSubscription, async (req, res) => {
  try {
    const fcmService = getUserFCMService(req.user.id);

    if (!fcmService) {
      return res.status(400).json({
        success: false,
        error: '用户服务未初始化，请联系管理员'
      });
    }

    // 检查是否已有保存的凭证
    const [servers] = await db.query(
      `SELECT fcmCredentials FROM servers
       WHERE userId = ? AND fcmCredentials IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );

    if (servers.length === 0 || !servers[0].fcmCredentials) {
      return res.status(400).json({
        success: false,
        error: '未找到 FCM 凭证，请先配置凭证'
      });
    }

    // 解析 JSON（如果是字符串）
    const credentials = typeof servers[0].fcmCredentials === 'string'
      ? JSON.parse(servers[0].fcmCredentials)
      : servers[0].fcmCredentials;

    // 启动 FCM 监听
    await fcmService.start(credentials);

    res.json({
      success: true,
      message: 'FCM 监听已启动，请在游戏中配对服务器',
      credentials: {
        type: credentials.gcm ? 'GCM' : 'FCM',
        androidId: credentials.gcm?.androidId ? `${String(credentials.gcm.androidId).substring(0, 8)}****` : null,
        isListening: true
      }
    });
  } catch (error) {
    console.error('启动 FCM 失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pairing/stop
 * 停止 FCM 监听
 */
router.post('/stop', async (req, res) => {
  try {
    const fcmService = getUserFCMService(req.user.id);

    if (!fcmService) {
      return res.status(400).json({
        success: false,
        error: '用户服务未初始化'
      });
    }

    await fcmService.stop();

    res.json({
      success: true,
      message: 'FCM 监听已停止'
    });
  } catch (error) {
    console.error('停止 FCM 失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pairing/register/simple
 * 简化版配对：直接使用用户的 Companion 凭证
 * 需要有效订阅
 *
 * 用户从 companion-rust.facepunch.com 复制凭证命令后提交
 * 格式: /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ...
 */
router.post('/register/simple', requireActiveSubscription, async (req, res) => {
  try {
    const { credentials_command } = req.body;

    if (!credentials_command) {
      return res.status(400).json({
        success: false,
        error: '缺少 credentials_command 参数'
      });
    }

    // 解析凭证命令
    const regex = /(\w+):(\S+)/g;
    const params = {};
    let match;
    while ((match = regex.exec(credentials_command)) !== null) {
      params[match[1]] = match[2];
    }

    // 验证必需字段
    if (!params.gcm_android_id || !params.gcm_security_token) {
      return res.status(400).json({
        success: false,
        error: '凭证格式错误：缺少 gcm_android_id 或 gcm_security_token'
      });
    }

    console.log(`[Pairing] 用户 ${req.user.username} 配置 FCM 凭证:`);
    console.log('   Android ID:', params.gcm_android_id);
    console.log('   Steam ID:', params.steam_id || '未提供');

    // 检查有效期
    if (params.expire_date) {
      const expireTime = new Date(parseInt(params.expire_date) * 1000);
      const now = new Date();
      console.log('   过期时间:', expireTime.toLocaleString());

      if (now > expireTime) {
        return res.status(400).json({
          success: false,
          error: '凭证已过期，请重新从 Companion 获取'
        });
      }
    }

    // 构建凭证对象
    const credentials = {
      gcm: {
        androidId: params.gcm_android_id,
        securityToken: params.gcm_security_token,
      },
      steam: {
        steamId: params.steam_id || 'unknown',
      },
      companion: params, // 保存所有原始信息
    };

    // 保存凭证到数据库（存储在第一个服务器或创建临时占位符）
    const [serverRows] = await db.query(
      'SELECT id FROM servers WHERE userId = ? LIMIT 1',
      [req.user.id]
    );

    const now = new Date();
    if (serverRows.length === 0) {
      // 如果用户还没有服务器，创建一个占位符用于存储 FCM 凭证
      const serverId = `fcm-${req.user.id}`;
      await db.query(
        `INSERT INTO servers (id, userId, name, ip, port, playerId, playerToken, fcmCredentials, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [serverId, req.user.id, 'FCM 凭证占位符', '0.0.0.0', '0', '0', 'placeholder', JSON.stringify(credentials), 0, now, now]
      );
    } else {
      // 更新现有服务器的凭证
      await db.query(
        'UPDATE servers SET fcmCredentials = ?, updatedAt = ? WHERE id = ?',
        [JSON.stringify(credentials), now, serverRows[0].id]
      );
    }

    // 启动 FCM 监听
    const fcmService = getUserFCMService(req.user.id);
    if (fcmService) {
      await fcmService.start(credentials);
    }

    console.log(`[Pairing] 用户 ${req.user.username} FCM 凭证已保存并开始监听`);

    res.json({
      success: true,
      message: 'FCM 凭证已保存并开始监听',
      isListening: true,
      credentials: {
        androidId: params.gcm_android_id,
        steamId: params.steam_id,
        expiresAt: params.expire_date
          ? new Date(parseInt(params.expire_date) * 1000).toISOString()
          : null,
      }
    });
  } catch (error) {
    console.error('配置 FCM 凭证失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/pairing/credentials
 * 获取 FCM 凭证信息（用于调试）
 */
router.get('/credentials', async (req, res) => {
  try {
    // 从数据库获取凭证
    const [servers] = await db.query(
      `SELECT fcmCredentials FROM servers
       WHERE userId = ? AND fcmCredentials IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );

    if (servers.length === 0 || !servers[0].fcmCredentials) {
      return res.json({
        success: true,
        hasCredentials: false,
        message: '未找到 FCM 凭证'
      });
    }

    const credentials = typeof servers[0].fcmCredentials === 'string'
      ? JSON.parse(servers[0].fcmCredentials)
      : servers[0].fcmCredentials;

    res.json({
      success: true,
      hasCredentials: true,
      credentials: {
        type: credentials.gcm ? 'GCM' : 'FCM',
        androidId: credentials.gcm?.androidId ? `${String(credentials.gcm.androidId).substring(0, 8)}****` : null,
        steamId: credentials.steam?.steamId || credentials.companion?.steam_id || 'unknown',
        expiresAt: credentials.companion?.expire_date
          ? new Date(parseInt(credentials.companion.expire_date) * 1000).toISOString()
          : null
      }
    });
  } catch (error) {
    console.error('获取凭证信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pairing/reset
 * 重置 FCM 凭证和配对
 */
router.post('/reset', async (req, res) => {
  try {
    console.log(`[Pairing] 用户 ${req.user.username} 重置 FCM 凭证...`);

    // 1. 停止 FCM 监听
    const fcmService = getUserFCMService(req.user.id);
    if (fcmService) {
      await fcmService.stop();
      console.log('   FCM 监听已停止');
    }

    // 2. 获取用户的 RustPlus 服务并断开所有连接
    const userService = globalServiceManager.getUserService(req.user.id);
    if (userService && userService.rustPlusService) {
      await userService.rustPlusService.disconnectAll();
      console.log('   所有服务器连接已断开');
    }

    // 3. 从数据库删除 FCM 凭证（但保留服务器信息）
    const [servers] = await db.query(
      `SELECT id FROM servers WHERE userId = ? AND fcmCredentials IS NOT NULL`,
      [req.user.id]
    );

    for (const server of servers) {
      await db.query(
        'UPDATE servers SET fcmCredentials = NULL, updatedAt = ? WHERE id = ?',
        [new Date(), server.id]
      );
    }

    console.log(`   已清除 ${servers.length} 个服务器的 FCM 凭证`);

    res.json({
      success: true,
      message: 'FCM 凭证已清除，服务器信息已保留',
      cleared: {
        credentials: servers.length,
        connections: true
      }
    });
  } catch (error) {
    console.error('重置 FCM 凭证失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pairing/credentials/diagnose
 * FCM 凭证诊断
 */
router.get('/credentials/diagnose', async (req, res) => {
  try {
    // 从数据库获取凭证
    const [servers] = await db.query(
      `SELECT fcmCredentials FROM servers
       WHERE userId = ? AND fcmCredentials IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );

    const issues = [];
    const info = {};

    // 1. 检查是否有凭证
    if (servers.length === 0 || !servers[0].fcmCredentials) {
      issues.push({
        level: 'error',
        message: '没有找到任何 FCM 凭证',
        solution: '请通过设置页面配置 FCM 凭证，或从 companion-rust.facepunch.com 获取'
      });
      return res.json({
        success: true,
        hasIssues: true,
        issues,
        info: {},
        recommendation: '需要先配置 FCM 凭证才能接收配对推送'
      });
    }

    const creds = typeof servers[0].fcmCredentials === 'string'
      ? JSON.parse(servers[0].fcmCredentials)
      : servers[0].fcmCredentials;

    // 2. 检查凭证类型
    if (!creds.gcm) {
      issues.push({
        level: 'error',
        message: '凭证缺少 GCM 格式数据',
        solution: '需要包含 gcm.androidId 和 gcm.securityToken 的凭证'
      });
    } else {
      info.type = 'GCM';
      info.androidId = creds.gcm.androidId
        ? `${String(creds.gcm.androidId).substring(0, 8)}****`
        : null;
      info.hasSecurityToken = !!creds.gcm.securityToken;

      if (!creds.gcm.androidId) {
        issues.push({
          level: 'error',
          message: '缺少 androidId',
          solution: '重新从 companion-rust.facepunch.com 获取凭证'
        });
      }

      if (!creds.gcm.securityToken) {
        issues.push({
          level: 'error',
          message: '缺少 securityToken',
          solution: '重新从 companion-rust.facepunch.com 获取凭证'
        });
      }
    }

    // 3. 检查有效期
    if (creds.companion?.expire_date) {
      const expireTimestamp = creds.companion.expire_date;
      const expireTime = new Date(parseInt(expireTimestamp) * 1000);
      const now = new Date();

      info.expiresAt = expireTime.toISOString();
      info.isExpired = now > expireTime;

      if (now > expireTime) {
        issues.push({
          level: 'error',
          message: `凭证已过期 (${expireTime.toLocaleString()})`,
          solution: '请重新从 companion-rust.facepunch.com 获取新凭证'
        });
      } else {
        const daysLeft = Math.ceil((expireTime - now) / (1000 * 60 * 60 * 24));
        info.daysUntilExpire = daysLeft;
        if (daysLeft <= 7) {
          issues.push({
            level: 'warning',
            message: `凭证即将在 ${daysLeft} 天后过期`,
            solution: '建议提前更新凭证'
          });
        }
      }
    } else {
      info.expiresAt = '未知';
      issues.push({
        level: 'warning',
        message: '凭证缺少有效期信息',
        solution: '可能是旧版凭证，建议重新获取'
      });
    }

    // 4. 检查 Steam ID
    if (creds.steam?.steamId) {
      info.steamId = creds.steam.steamId;
    } else if (creds.companion?.steam_id) {
      info.steamId = creds.companion.steam_id;
    } else {
      issues.push({
        level: 'warning',
        message: '凭证缺少 Steam ID',
        solution: '可能导致推送无法正确路由到您的账号'
      });
    }

    // 5. 检查监听状态和 live status
    const fcmService = getUserFCMService(req.user.id);
    const serviceStatus = fcmService ? fcmService.getStatus() : null;
    info.isListening = serviceStatus ? serviceStatus.isListening : false;

    if (!info.isListening && creds) {
      // 检查是否有最近的连接错误
      if (serviceStatus && serviceStatus.lastError) {
        const lastError = serviceStatus.lastError;

        // 只要有 unconnected error, 就报告 (connect 会清除 lastError)
        issues.push({
          level: 'error',
          message: `连接失败: ${lastError.message}`,
          solution: '凭证可能已失效或网络连接受阻，请尝试更新凭证'
        });
        info.lastError = lastError;
      } else {
        issues.push({
          level: 'warning',
          message: 'FCM 当前未在监听状态',
          solution: '请点击"开始监听"按钮启动 FCM'
        });
      }
    } else if (info.isListening && serviceStatus?.lastError) {
      // 虽然显示监听中，但可能有后台错误 (仅显示最近的)
      const lastError = serviceStatus.lastError;
      if (Date.now() - lastError.timestamp < 300000) { // 5分钟内
        issues.push({
          level: 'warning',
          message: `连接不稳定: ${lastError.message}`,
          solution: '请检查网络连接状态'
        });
        // 这种情况下也传回 lastError 以便前端展示小黄条
        info.lastError = lastError;
      }
    }

    // 6. 生成建议
    let recommendation = '';
    const errorCount = issues.filter(i => i.level === 'error').length;
    const warningCount = issues.filter(i => i.level === 'warning').length;

    if (errorCount > 0) {
      recommendation = '存在严重问题，需要重新配置凭证';
    } else if (warningCount > 0) {
      recommendation = '凭证基本正常，但有一些注意事项';
    } else {
      recommendation = '凭证配置正常';
    }

    res.json({
      success: true,
      hasIssues: issues.length > 0,
      issues,
      info,
      recommendation
    });
  } catch (error) {
    console.error('诊断凭证失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
  /**
   * POST /api/pairing/credentials/verify
   * 主动验证当前凭证有效性
   */
router.post('/credentials/verify', async (req, res) => {
  try {
    const fcmService = getUserFCMService(req.user.id);
    if (!fcmService) {
      throw new Error('用户服务未初始化');
    }

    // 从数据库获取凭证
    const [servers] = await db.query(
      `SELECT fcmCredentials FROM servers
       WHERE userId = ? AND fcmCredentials IS NOT NULL
       LIMIT 1`,
      [req.user.id]
    );

    if (servers.length === 0 || !servers[0].fcmCredentials) {
      return res.status(400).json({
        success: false,
        error: '未找到凭证'
      });
    }

    const credentials = typeof servers[0].fcmCredentials === 'string'
      ? JSON.parse(servers[0].fcmCredentials)
      : servers[0].fcmCredentials;

    // 调用 active check
    await fcmService.testConnection(credentials);

    res.json({
      success: true,
      message: '凭证验证通过'
    });
  } catch (error) {
    console.error('凭证验证失败:', error.message);
    res.status(400).json({
      success: false,
      error: error.message, // 返回具体错误给前端展示
      isConnectionError: true
    });
  }
});

export default router;
