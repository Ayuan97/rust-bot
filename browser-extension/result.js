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

    // 从 Steam Auth Token (JWT) 中解析过期时间
    let expireTimestamp = null;
    let issuedTimestamp = null;
    try {
        // JWT 格式: header.payload.signature
        const tokenParts = credentials.authToken.split('.');
        if (tokenParts.length >= 2) {
            // 解码 payload (Base64)
            const payload = JSON.parse(atob(tokenParts[1]));
            console.log('JWT payload:', payload);

            // exp 是过期时间 (Unix 时间戳，秒)
            if (payload.exp) {
                expireTimestamp = payload.exp;
            }
            // iat 是签发时间
            if (payload.iat) {
                issuedTimestamp = payload.iat;
            }
        }
    } catch (e) {
        console.warn('解析 JWT 失败:', e);
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
        document.getElementById('registerDate').textContent = new Date().toLocaleString('zh-CN');
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
