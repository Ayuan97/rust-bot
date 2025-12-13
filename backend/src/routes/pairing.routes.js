import express from 'express';
import fcmService from '../services/fcm.service.js';
import configStorage from '../models/config.model.js';
import storage from '../models/storage.model.js';
import rustPlusService from '../services/rustplus.service.js';

const router = express.Router();

/**
 * 获取配对状态
 */

router.get('/status', (req, res) => {
  try {
    const status = fcmService.getStatus();
    const hasStoredCredentials = configStorage.hasFCMCredentials();

    res.json({
      success: true,
      status: {
        ...status,
        hasStoredCredentials
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 开始 FCM 监听（初始化配对）
 */
router.post('/start', async (req, res) => {
  try {
    // 检查是否已有凭证
    let credentials = configStorage.getFCMCredentials();

    if (credentials) {
      console.log('✅ 使用已保存的 FCM 凭证');
      fcmService.loadCredentials(credentials);
      await fcmService.startListening();
    } else {
      console.log('🆕 注册新的 FCM 凭证');
      credentials = await fcmService.registerAndListen();

      // 保存凭证
      configStorage.saveFCMCredentials(credentials);
    }

    res.json({
      success: true,
      message: 'FCM 监听已启动，请在游戏中配对服务器',
      credentials: {
        type: credentials.gcm ? 'GCM' : 'FCM',
        androidId: credentials.gcm ? credentials.gcm.androidId : null,
        token: credentials.fcm ? credentials.fcm.token.substring(0, 50) + '...' : null,
        isListening: true
      }
    });
  } catch (error) {
    console.error('启动 FCM 失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 停止 FCM 监听
 */
router.post('/stop', (req, res) => {
  try {
    fcmService.stopListening();
    res.json({ success: true, message: 'FCM 监听已停止' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 重置 FCM 凭证（清空凭证并清除所有服务器）
 */
router.post('/reset', async (req, res) => {
  try {
    console.log('🔄 开始重置 FCM 凭证和服务器信息...');

    // 1. 获取所有服务器并断开连接
    const servers = storage.getAllServers();
    for (const server of servers) {
      if (rustPlusService.isConnected(server.id)) {
        console.log(`🔌 断开服务器连接: ${server.name}`);
        await rustPlusService.disconnect(server.id);
      }
      
      // 删除服务器及其相关数据
      console.log(`🗑️  删除服务器: ${server.name}`);
      storage.deleteServer(server.id);
    }

    // 2. 停止 FCM 监听
    fcmService.stopListening();
    console.log('⏹️  FCM 监听已停止');

    // 3. 删除 FCM 凭证
    configStorage.deleteFCMCredentials();
    console.log('🗑️  FCM 凭证已删除');

    console.log('✅ 重置完成\n');

    res.json({
      success: true,
      message: 'FCM 凭证和所有服务器信息已清空，请重新配置',
      cleared: {
        servers: servers.length,
        credentials: true
      }
    });
  } catch (error) {
    console.error('❌ 重置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 FCM 凭证信息（用于调试）
 */
router.get('/credentials', (req, res) => {
  try {
    const credentials = fcmService.getCredentials();

    if (!credentials) {
      return res.json({
        success: true,
        hasCredentials: false,
        message: '未找到 FCM 凭证'
      });
    }

    res.json({
      success: true,
      hasCredentials: true,
      credentials: {
        type: credentials.gcm ? 'GCM' : 'FCM',
        androidId: credentials.gcm ? credentials.gcm.androidId : null,
        token: credentials.fcm ? credentials.fcm.token.substring(0, 50) + '...' : null,
        pushSet: credentials.fcm ? credentials.fcm.pushSet : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动设置 FCM 凭证
 */
router.post('/credentials/manual', async (req, res) => {
  try {
    const credentialsData = req.body;

    // 验证凭证格式
    if (!credentialsData || typeof credentialsData !== 'object') {
      return res.status(400).json({ success: false, error: '凭证数据格式无效' });
    }

    // 验证必须有 gcm 或 fcm 凭证
    if (!credentialsData.gcm && !credentialsData.fcm) {
      return res.status(400).json({ success: false, error: '缺少 gcm 或 fcm 凭证' });
    }

    // 如果是 GCM 凭证，验证必要字段
    if (credentialsData.gcm) {
      if (!credentialsData.gcm.androidId || !credentialsData.gcm.securityToken) {
        return res.status(400).json({ success: false, error: 'GCM 凭证缺少 androidId 或 securityToken' });
      }
    }

    // 设置凭证
    fcmService.setManualCredentials(credentialsData);

    // 保存凭证
    configStorage.saveFCMCredentials(fcmService.getCredentials());

    // 开始监听
    await fcmService.startListening();

    res.json({
      success: true,
      message: 'FCM 凭证已保存并开始监听',
      isListening: true
    });
  } catch (error) {
    console.error('设置手动凭证失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 尝试从 rustplus CLI 加载凭证
 */
router.post('/credentials/load-cli', async (req, res) => {
  try {
    const loaded = await fcmService.loadFromRustPlusCLI();

    if (loaded) {
      // 保存凭证
      configStorage.saveFCMCredentials(fcmService.getCredentials());

      // 开始监听
      await fcmService.startListening();

      res.json({
        success: true,
        message: '已从 rustplus CLI 加载凭证并开始监听'
      });
    } else {
      res.json({
        success: false,
        message: '未找到 rustplus CLI 凭证文件',
        hint: '请先运行 "rustplus-pairing-server" 获取凭证'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 简化版自动注册：直接使用用户的 Companion 凭证
 * 用户从 companion 页面复制凭证命令后提交
 *
 * 关键理解：
 * - 用户的 gcm_android_id + gcm_security_token 已经在 Companion 后端注册过
 * - 我们直接用这些凭证连接 MCS (mtalk.google.com:5228) 接收推送
 * - 不需要 auth_token（那是注册新设备时才需要的）
 */
router.post('/register/simple', async (req, res) => {
  try {
    const { credentials_command } = req.body;

    if (!credentials_command) {
      return res.status(400).json({
        success: false,
        error: '缺少 credentials_command 参数'
      });
    }

    // 解析凭证命令
    // 格式: /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx issued_date:xxx expire_date:xxx
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

    console.log('📝 解析 Companion 凭证:');
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

    // 构建凭证对象（使用用户的 GCM 凭证）
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

    console.log('');
    console.log('✅ 使用 Companion 凭证（已在服务端注册的设备）');
    console.log('   → 直接连接 MCS 接收推送，无需 auth_token');
    console.log('');

    // 加载凭证并开始监听
    fcmService.loadCredentials(credentials);
    configStorage.saveFCMCredentials(credentials);
    await fcmService.startListening();

    res.json({
      success: true,
      message: 'FCM 凭证已保存并开始监听',
      isListening: true,
      credentials: {
        androidId: params.gcm_android_id,
        steamId: params.steam_id,
        expiresAt: params.expire_date ? new Date(parseInt(params.expire_date) * 1000).toISOString() : null,
      }
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
