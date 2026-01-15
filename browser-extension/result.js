/**
 * Rust+ Credentials Helper - Result Page Script
 * 集成 FCM 注册和结果展示 (支持多种格式)
 */

let credentials = null;
let fullConfig = null;
let credentialsCommand = null; // 程序需要的命令格式
let fcmData = null; // 保存 FCM 注册数据

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
    document.getElementById('retryBtn').addEventListener('click', () => location.reload());

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
        // Step 1: 调用 FCM 注册 API
        console.log('Step 1: 请求 FCM 注册 API...');
        const fcmResponse = await fetch('https://api.rustplusplus.com/api/fcm/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!fcmResponse.ok) {
            const error = await fcmResponse.json();
            throw new Error(error.message || 'FCM 注册失败');
        }

        fcmData = await fcmResponse.json();
        console.log('FCM 注册成功:', fcmData);

        // Step 2: 注册到 Rust+ API
        console.log('Step 2: 注册到 Rust+ API...');
        const registerResponse = await fetch('https://companion-rust.facepunch.com/api/push/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                AuthToken: credentials.authToken,
                DeviceId: 'rustplus-web-dashboard',
                PushKind: 3,
                PushToken: fcmData.expoPushToken
            })
        });

        if (!registerResponse.ok) {
            console.warn('Rust+ API 注册失败，但凭证仍可使用');
        } else {
            console.log('Rust+ API 注册成功');
        }

        // 组装完整配置
        fullConfig = {
            fcm_credentials: fcmData.fcmCredentials,
            expo_push_token: fcmData.expoPushToken,
            rustplus_auth_token: credentials.authToken,
            steam_id: credentials.steamId,
            generated_at: new Date().toISOString()
        };

        showSuccess(fcmData.fcmCredentials, fcmData.expoPushToken);

    } catch (error) {
        console.error('注册失败:', error);
        showError('注册失败: ' + error.message);
    }
}

function showSuccess(fcmCreds, expoToken) {
    document.getElementById('registeringState').classList.add('hidden');
    document.getElementById('successState').classList.remove('hidden');

    console.log('credentials 数据:', credentials);
    console.log('rawData:', credentials.rawData);

    // 获取过期时间 - 优先从 Companion API 响应获取
    let expireTimestamp = null;
    let issuedTimestamp = null;

    // 1. 首先尝试从 Companion API 响应中获取
    if (credentials.expiry) {
        expireTimestamp = credentials.expiry;
        console.log('从 Companion API 获取 expiry:', expireTimestamp);
    }
    if (credentials.issued) {
        issuedTimestamp = credentials.issued;
        console.log('从 Companion API 获取 issued:', issuedTimestamp);
    }

    // 2. 如果没有，尝试从 rawData 中获取
    if (!expireTimestamp && credentials.rawData) {
        const raw = credentials.rawData;
        expireTimestamp = raw.Expiry || raw.expiry || raw.ExpiryDate || raw.expiryDate || raw.exp;
        issuedTimestamp = raw.Issued || raw.issued || raw.IssuedDate || raw.issuedDate || raw.iat;
        console.log('从 rawData 获取 expiry:', expireTimestamp, 'issued:', issuedTimestamp);
    }

    // 3. 如果还没有，从 Steam Auth Token 中解析
    // Token 格式: base64(json).signature (不是标准 JWT)
    if (!expireTimestamp && credentials.authToken) {
        try {
            const tokenParts = credentials.authToken.split('.');
            if (tokenParts.length >= 1) {
                // 第一部分是 Base64 编码的 JSON
                const payload = JSON.parse(atob(tokenParts[0]));
                console.log('Token payload:', payload);
                if (payload.exp) expireTimestamp = payload.exp;
                if (payload.iss) issuedTimestamp = payload.iss;
                console.log('从 Token 获取 exp:', expireTimestamp, 'iss:', issuedTimestamp);
            }
        } catch (e) {
            console.warn('解析 Token 失败:', e);
        }
    }

    // 生成程序需要的命令格式
    const gcmAndroidId = String(fcmCreds.gcm.androidId);
    const gcmSecurityToken = String(fcmCreds.gcm.securityToken);
    const steamId = credentials.steamId;

    // 构建命令，如果有过期时间就加上
    let command = `/credentials add gcm_android_id:${gcmAndroidId} gcm_security_token:${gcmSecurityToken} steam_id:${steamId}`;
    if (issuedTimestamp) {
        command += ` issued_date:${issuedTimestamp}`;
    }
    if (expireTimestamp) {
        command += ` expire_date:${expireTimestamp}`;
    }
    credentialsCommand = command;

    // 1. 显示命令
    document.getElementById('credentialsCommand').textContent = credentialsCommand;

    // 2. 显示详细字段
    document.getElementById('gcmAndroidId').textContent = gcmAndroidId;
    document.getElementById('gcmSecurityToken').textContent = gcmSecurityToken;
    document.getElementById('steamId').textContent = steamId;

    // 3. 显示过期时间
    if (expireTimestamp) {
        const expireDate = new Date(expireTimestamp * 1000);
        const expireDateStr = expireDate.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('registerDate').textContent = expireDateStr;

        // 计算剩余天数
        const now = new Date();
        const daysLeft = Math.ceil((expireDate - now) / (24 * 60 * 60 * 1000));

        // 更新标签和样式
        const expireInfo = document.querySelector('.expire-info');
        const expireIcon = document.querySelector('.expire-icon');

        if (daysLeft > 0) {
            expireIcon.textContent = '⏰';
            expireInfo.querySelector('span:nth-child(2)').innerHTML =
                `有效期至: <strong id="registerDate">${expireDateStr}</strong> (剩余 ${daysLeft} 天)`;
        } else {
            expireIcon.textContent = '⚠️';
            expireInfo.style.background = 'rgba(233, 69, 96, 0.1)';
            expireInfo.style.borderColor = 'rgba(233, 69, 96, 0.3)';
            expireInfo.querySelector('span:nth-child(2)').innerHTML =
                `<strong style="color: #e94560;">已过期!</strong> (${expireDateStr})`;
        }
    } else {
        // 没有过期时间，显示注册时间
        document.getElementById('registerDate').textContent = new Date().toLocaleString('zh-CN');
        document.querySelector('.expire-info span:nth-child(2)').innerHTML =
            `注册时间: <strong id="registerDate">${new Date().toLocaleString('zh-CN')}</strong>`;
    }

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
