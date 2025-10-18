import express from 'express';
import fcmService from '../services/fcm.service.js';
import configStorage from '../models/config.model.js';

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
      fcmService.startListening();
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
        token: credentials.fcm.token.substring(0, 50) + '...',
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
 * 重置 FCM 凭证（重新配对）
 */
router.post('/reset', async (req, res) => {
  try {
    // 停止监听
    fcmService.stopListening();

    // 删除旧凭证
    configStorage.deleteFCMCredentials();

    // 注册新凭证
    const credentials = await fcmService.registerAndListen();
    configStorage.saveFCMCredentials(credentials);

    res.json({
      success: true,
      message: 'FCM 已重置，请重新在游戏中配对',
      credentials: {
        token: credentials.fcm.token.substring(0, 50) + '...',
        isListening: true
      }
    });
  } catch (error) {
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
        token: credentials.fcm.token.substring(0, 50) + '...',
        pushSet: credentials.fcm.pushSet
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

    // 设置凭证
    fcmService.setManualCredentials(credentialsData);

    // 保存凭证
    configStorage.saveFCMCredentials(fcmService.getCredentials());

    // 开始监听
    fcmService.startListening();

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
      fcmService.startListening();

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

export default router;
