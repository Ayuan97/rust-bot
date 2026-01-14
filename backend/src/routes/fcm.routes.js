/**
 * FCM Registration API Routes
 * 为浏览器插件提供 FCM 注册服务
 */

import express from 'express';
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const logger = createLogger('fcm-api');

// Rust+ App 配置 (来自 rustplus.js)
const RUSTPLUS_CONFIG = {
    apiKey: 'AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY',
    projectId: 'rust-companion-app',
    gcmSenderId: '976529667804',
    gmsAppId: '1:976529667804:android:d6f1ddeb4403b338fea619',
    androidPackageName: 'com.facepunch.rust.companion',
    androidPackageCert: 'E28D05345FB78A7A1A63D70F4A302DBF426CA5AD'
};

/**
 * POST /api/fcm/register
 * 注册 FCM 设备并获取 Expo Push Token
 */
router.post('/register', async (req, res) => {
    try {
        logger.info('📱 开始 FCM 注册流程...');

        // Step 1: Register with FCM
        logger.info('  → 向 Google FCM 注册设备...');
        const fcmCredentials = await AndroidFCM.register(
            RUSTPLUS_CONFIG.apiKey,
            RUSTPLUS_CONFIG.projectId,
            RUSTPLUS_CONFIG.gcmSenderId,
            RUSTPLUS_CONFIG.gmsAppId,
            RUSTPLUS_CONFIG.androidPackageName,
            RUSTPLUS_CONFIG.androidPackageCert
        );

        logger.info('  ✅ FCM 注册成功');

        // Step 2: Get Expo Push Token
        logger.info('  → 获取 Expo Push Token...');
        const expoPushToken = await getExpoPushToken(fcmCredentials.fcm.token);
        logger.info('  ✅ Expo Push Token 获取成功');

        res.json({
            success: true,
            fcmCredentials,
            expoPushToken,
            message: 'FCM 注册成功，请继续 Steam 登录'
        });

    } catch (error) {
        logger.error('❌ FCM 注册失败:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'FCM 注册失败'
        });
    }
});

/**
 * POST /api/fcm/complete
 * 完成 Rust+ API 注册
 */
router.post('/complete', async (req, res) => {
    try {
        const { authToken, expoPushToken } = req.body;

        if (!authToken || !expoPushToken) {
            return res.status(400).json({
                success: false,
                message: '缺少 authToken 或 expoPushToken'
            });
        }

        logger.info('📱 注册到 Rust+ API...');

        await registerWithRustPlus(authToken, expoPushToken);

        logger.info('✅ Rust+ API 注册成功');

        res.json({
            success: true,
            message: 'Rust+ 注册完成'
        });

    } catch (error) {
        logger.error('❌ Rust+ API 注册失败:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Rust+ API 注册失败'
        });
    }
});

/**
 * 获取 Expo Push Token
 */
async function getExpoPushToken(fcmToken) {
    const response = await axios.post('https://exp.host/--/api/v2/push/getExpoPushToken', {
        type: 'fcm',
        deviceId: uuidv4(),
        development: false,
        appId: 'com.facepunch.rust.companion',
        deviceToken: fcmToken,
        projectId: '49451aca-a822-41e6-ad59-955718d0ff9c'
    });

    return response.data.data.expoPushToken;
}

/**
 * 注册到 Rust+ API
 */
async function registerWithRustPlus(authToken, expoPushToken) {
    await axios.post('https://companion-rust.facepunch.com/api/push/register', {
        AuthToken: authToken,
        DeviceId: 'rustplus-web-dashboard',
        PushKind: 3,
        PushToken: expoPushToken
    });
}

export default router;
