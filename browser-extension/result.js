/**
 * Rust+ Credentials Helper - Result Page Script
 * 集成 FCM 注册和结果展示 (支持多种格式)
 */

let credentials = null;
let fullConfig = null;
let credentialsCommand = null; // 程序需要的命令格式

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
    document.getElementById('copyCommandBtn').addEventListener('click', copyCommand);
    document.getElementById('downloadBtn').addEventListener('click', downloadCredentials);

    // 单项复制按钮
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetId = e.target.dataset.target;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                await navigator.clipboard.writeText(targetEl.textContent);
                e.target.textContent = '已复制';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = '复制';
                    e.target.classList.remove('copied');
                }, 1500);
            }
        });
    });
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

    // 记录注册时间
    const registerDate = new Date();

    // 生成程序需要的命令格式 (不包含 expire_date，因为 FCM 凭证没有固定过期时间)
    const gcmAndroidId = String(fcmCreds.gcm.androidId);
    const gcmSecurityToken = String(fcmCreds.gcm.securityToken);
    const steamId = credentials.steamId;

    credentialsCommand = `/credentials add gcm_android_id:${gcmAndroidId} gcm_security_token:${gcmSecurityToken} steam_id:${steamId}`;

    // 1. 显示命令
    document.getElementById('credentialsCommand').textContent = credentialsCommand;

    // 2. 显示详细字段
    document.getElementById('gcmAndroidId').textContent = gcmAndroidId;
    document.getElementById('gcmSecurityToken').textContent = gcmSecurityToken;
    document.getElementById('steamId').textContent = steamId;

    // 3. 显示注册时间
    const registerDateStr = registerDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('registerDate').textContent = registerDateStr;

    // 4. 完整配置放到详情里
    document.getElementById('fullCredentialsDisplay').textContent = JSON.stringify(fullConfig, null, 2);
}

function showError(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('registeringState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').innerText = message;
}

async function copyCommand() {
    if (!credentialsCommand) return;
    await navigator.clipboard.writeText(credentialsCommand);
    showCopyFeedback('命令已复制!');
}

function downloadCredentials() {
    if (!credentialsCommand) return;

    // 下载包含命令和详细信息的文本文件
    const content = `Rust+ FCM 凭证
=====================================

【复制以下命令到程序中使用】
${credentialsCommand}

【详细信息】
GCM Android ID: ${document.getElementById('gcmAndroidId').textContent}
GCM Security Token: ${document.getElementById('gcmSecurityToken').textContent}
Steam ID: ${document.getElementById('steamId').textContent}
注册时间: ${document.getElementById('registerDate').textContent}

【完整 JSON 配置】
${JSON.stringify(fullConfig, null, 2)}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rustplus_credentials_${credentials.steamId}.txt`;
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
