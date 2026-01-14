/**
 * Rust+ Credentials Helper - Result Page Script
 * 集成 FCM 注册和结果展示 (支持多种格式)
 */

let credentials = null;
let fullConfig = null;
let programFormat = null; // 程序需要的格式

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
    document.getElementById('copyProgramFormat').addEventListener('click', copyProgramFormatJson);
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

    // 计算过期时间 (FCM 凭证通常 7 天有效)
    const issuedDate = new Date();
    const expireDate = new Date(issuedDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 生成程序需要的格式
    programFormat = {
        gcm_android_id: String(fcmCreds.gcm.androidId),
        gcm_security_token: String(fcmCreds.gcm.securityToken),
        steam_id: credentials.steamId,
        fcm_token: fcmCreds.fcm.token,
        auth_token: credentials.authToken,
        issued_date: issuedDate.toISOString(),
        expire_date: expireDate.toISOString()
    };

    // 1. 显示主要凭证字段
    document.getElementById('gcmAndroidId').textContent = programFormat.gcm_android_id;
    document.getElementById('gcmSecurityToken').textContent = programFormat.gcm_security_token;
    document.getElementById('steamId').textContent = programFormat.steam_id;

    // 2. 显示过期时间
    const expireDateStr = expireDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('expireDate').textContent = expireDateStr;

    // 计算剩余天数
    const daysLeft = Math.ceil((expireDate - new Date()) / (24 * 60 * 60 * 1000));
    const expireDaysEl = document.getElementById('expireDays');
    if (daysLeft > 0) {
        expireDaysEl.textContent = `剩余 ${daysLeft} 天`;
    } else {
        expireDaysEl.textContent = '已过期';
        document.getElementById('expireInfo').classList.add('expired');
    }

    // 3. 完整配置放到详情里
    document.getElementById('fullCredentialsDisplay').textContent = JSON.stringify(fullConfig, null, 2);
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

async function copyProgramFormatJson() {
    if (!programFormat) return;
    const json = JSON.stringify(programFormat, null, 2);
    await navigator.clipboard.writeText(json);
    showCopyFeedback('程序格式已复制!');
}

function downloadCredentials() {
    if (!programFormat) return;
    const json = JSON.stringify(programFormat, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rustplus_credentials_${programFormat.steam_id}.json`;
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
