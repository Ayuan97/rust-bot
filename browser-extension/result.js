/**
 * Rust+ Credentials Helper - Result Page Script
 * 集成 FCM 注册和结果展示 (支持多种格式)
 */

let credentials = null;
let fullConfig = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 从 storage 获取捕获的 auth data
    const result = await chrome.storage.local.get(['authData']);

    if (result.authData && result.authData.authToken) {
        credentials = result.authData;
        startFCMRegistration();
    } else {
        // 等待数据
        document.getElementById('loadingState').classList.remove('hidden');

        const listener = (changes, area) => {
            if (area === 'local' && changes.authData && changes.authData.newValue) {
                credentials = changes.authData.newValue;
                chrome.storage.onChanged.removeListener(listener);
                startFCMRegistration();
            }
        };
        chrome.storage.onChanged.addListener(listener);

        // 5分钟超时
        setTimeout(() => {
            if (!credentials) {
                showError('登录超时，请重试');
            }
        }, 300000);
    }

    // 设置按钮事件
    document.getElementById('copyAllBtn').addEventListener('click', copyAll);
    document.getElementById('downloadBtn').addEventListener('click', downloadCredentials);
});

async function startFCMRegistration() {
    // 隐藏加载，显示注册中
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('registeringState').classList.remove('hidden');

    try {
        console.log('开始请求后端 FCM 注册 API...');

        // 调用后端 API (使用 rustplusplus 公共 API)
        const response = await fetch('https://api.rustplusplus.com/api/fcm/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '后端 API 请求失败');
        }

        const data = await response.json();
        console.log('FCM 注册成功:', data);

        // 组装完整配置
        fullConfig = {
            fcm_credentials: data.fcmCredentials,
            expo_push_token: data.expoPushToken,
            rustplus_auth_token: credentials.authToken,
            steam_id: credentials.steamId,
            generated_at: new Date().toISOString()
        };

        showSuccess(data.fcmCredentials, data.expoPushToken);

    } catch (error) {
        console.error('FCM 注册失败:', error);
        showError('FCM 注册失败: ' + error.message);
    }
}

function showSuccess(fcmCreds, expoToken) {
    document.getElementById('registeringState').classList.add('hidden');
    document.getElementById('successState').classList.remove('hidden');

    // 1. 显示完整配置 JSON
    document.getElementById('fullCredentialsDisplay').textContent = JSON.stringify(fullConfig, null, 2);

    // 2. 解析 Token 获取日期信息（用于生成 rustplusplus 命令格式）
    try {
        const tokenParts = credentials.authToken.split('.');
        if (tokenParts.length >= 2) {
            const payload = JSON.parse(atob(tokenParts[0])); // Rust+ token payload 实际上是在第一部分
            // 注意：Rust+ token 格式有点特殊，可能是 header.payload.signature 或者 payload.signature
            // 实际观察日志: eyJzdGVhbUlkIj... 是 standard JWT header/payload 结构

            // 尝试生成命令格式
            const commandFormat = `/credentials add gcm_android_id:${fcmCreds.gcm.androidId} gcm_security_token:${fcmCreds.gcm.securityToken} steam_id:${fullConfig.steam_id}`;

            // 添加到页面显示（可选）
            const cmdBox = document.createElement('div');
            cmdBox.className = 'token-box mini';
            cmdBox.style.marginTop = '10px';
            cmdBox.textContent = commandFormat;

            const cmdLabel = document.createElement('div');
            cmdLabel.className = 'label';
            cmdLabel.style.marginTop = '15px';
            cmdLabel.textContent = 'RustPlusPlus Bot 命令格式';

            const detailsSection = document.querySelector('.details-section details');
            detailsSection.appendChild(cmdLabel);
            detailsSection.appendChild(cmdBox);
        }
    } catch (e) {
        console.warn('解析 token 失败:', e);
    }

    // 显示详细信息
    document.getElementById('tokenDisplay').textContent = credentials.authToken;
    document.getElementById('fcmTokenDisplay').textContent = fcmCreds.fcm.token;
}

function showError(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('registeringState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').innerText = message;
}

async function copyAll() {
    if (!fullConfig) return;
    const json = JSON.stringify(fullConfig, null, 2);
    await navigator.clipboard.writeText(json);
    showCopyFeedback();
}

function downloadCredentials() {
    if (!fullConfig) return;
    const json = JSON.stringify(fullConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rustplus_config.json';
    a.click();
    URL.revokeObjectURL(url);
    showCopyFeedback('已下载!');
}

function showCopyFeedback(message = '已复制到剪贴板!') {
    const feedback = document.getElementById('copyFeedback');
    feedback.textContent = message;
    feedback.classList.add('show');
    setTimeout(() => {
        feedback.classList.remove('show');
    }, 2000);
}
