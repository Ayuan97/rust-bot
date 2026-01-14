/**
 * Rust+ Credentials Helper - Popup Script
 * 处理用户交互和凭证获取流程
 */

// DOM Elements
const startBtn = document.getElementById('startBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const retryBtn = document.getElementById('retryBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiUrlInput = document.getElementById('apiUrl');
const statusIndicator = document.getElementById('statusIndicator');
const stepsSection = document.getElementById('stepsSection');
const credentialsSection = document.getElementById('credentialsSection');
const credentialsPreview = document.getElementById('credentialsPreview');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

// State
let currentCredentials = null;
let settings = {
    apiUrl: 'https://api.rustplusplus.com'
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await checkExistingCredentials();
    setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['settings']);
        if (result.settings) {
            settings = { ...settings, ...result.settings };
            apiUrlInput.value = settings.apiUrl;
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

// Save settings to storage
async function saveSettings() {
    settings.apiUrl = apiUrlInput.value.trim() || 'http://localhost:3000';
    await chrome.storage.local.set({ settings });
    showNotification('设置已保存');
}

// Check for existing credentials
async function checkExistingCredentials() {
    try {
        const result = await chrome.storage.local.get(['credentials']);
        if (result.credentials) {
            currentCredentials = result.credentials;
            showCredentials();
        }
    } catch (error) {
        console.error('检查凭证失败:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    startBtn.addEventListener('click', startCredentialFlow);
    copyBtn.addEventListener('click', copyCredentials);
    downloadBtn.addEventListener('click', downloadCredentials);
    resetBtn.addEventListener('click', resetFlow);
    retryBtn.addEventListener('click', resetFlow);
    saveSettingsBtn.addEventListener('click', saveSettings);
}

// Main credential acquisition flow
async function startCredentialFlow() {
    try {
        // Reset UI
        hideError();
        hideCredentials();
        setButtonLoading(true);
        updateStatus('正在获取凭证...', 'loading');

        // Step 1: FCM Registration (via backend API)
        updateStep(1, 'active');
        const fcmResult = await registerFCM();
        updateStep(1, 'completed');

        // Step 2: Steam Login
        updateStep(2, 'active');
        const authToken = await getSteamAuthToken();
        updateStep(2, 'completed');

        // Step 3: Register with Rust+ API
        updateStep(3, 'active');
        await registerWithRustPlus(fcmResult, authToken);
        updateStep(3, 'completed');

        // Save credentials
        currentCredentials = {
            fcm_credentials: fcmResult.fcmCredentials,
            expo_push_token: fcmResult.expoPushToken,
            rustplus_auth_token: authToken,
            steam_id: fcmResult.steamId || null,
            created_at: new Date().toISOString()
        };

        await chrome.storage.local.set({ credentials: currentCredentials });

        // Show success
        updateStatus('凭证获取成功!', 'success');
        showCredentials();

    } catch (error) {
        console.error('获取凭证失败:', error);
        showError(error.message || '未知错误');
        updateStatus('获取失败', 'error');
    } finally {
        setButtonLoading(false);
    }
}

// Step 1: Register with FCM via backend API
async function registerFCM() {
    const response = await fetch(`${settings.apiUrl}/api/fcm/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).catch(err => {
        throw new Error('无法连接 API 服务，请检查网络连接');
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'FCM 注册失败');
    }

    return await response.json();
}

// Step 2: Get Steam Auth Token
async function getSteamAuthToken() {
    return new Promise((resolve, reject) => {
        // Open Steam login page in new tab
        chrome.tabs.create({
            url: 'https://companion-rust.facepunch.com/login',
            active: true
        }, (tab) => {
            const tabId = tab.id;

            // Set timeout
            const timeout = setTimeout(() => {
                chrome.tabs.remove(tabId).catch(() => { });
                reject(new Error('Steam 登录超时，请重试'));
            }, 300000); // 5 minutes timeout

            // Listen for auth token from content script
            const messageListener = (message, sender, sendResponse) => {
                if (message.type === 'RUSTPLUS_AUTH_TOKEN' && sender.tab?.id === tabId) {
                    clearTimeout(timeout);
                    chrome.runtime.onMessage.removeListener(messageListener);
                    chrome.tabs.remove(tabId).catch(() => { });

                    if (message.authToken) {
                        resolve(message.authToken);
                    } else {
                        reject(new Error('未能获取 Steam 认证令牌'));
                    }
                }
            };

            chrome.runtime.onMessage.addListener(messageListener);
        });
    });
}

// Step 3: Register with Rust+ API
async function registerWithRustPlus(fcmResult, authToken) {
    const response = await fetch(`${settings.apiUrl}/api/fcm/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            authToken,
            expoPushToken: fcmResult.expoPushToken
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Rust+ API 注册失败');
    }

    return await response.json();
}

// UI Helpers
function updateStep(stepNumber, status) {
    const step = document.getElementById(`step${stepNumber}`);
    step.classList.remove('active', 'completed', 'error');
    if (status) {
        step.classList.add(status);
    }
}

function updateStatus(text, type = 'normal') {
    const statusText = statusIndicator.querySelector('.status-text');
    statusText.textContent = text;
    statusIndicator.classList.remove('loading', 'error', 'success');
    if (type !== 'normal') {
        statusIndicator.classList.add(type);
    }
}

function setButtonLoading(loading) {
    startBtn.disabled = loading;
    if (loading) {
        startBtn.classList.add('loading');
        startBtn.querySelector('.btn-icon').textContent = '⏳';
        startBtn.querySelector('span:last-child').textContent = '获取中...';
    } else {
        startBtn.classList.remove('loading');
        startBtn.querySelector('.btn-icon').textContent = '🚀';
        startBtn.querySelector('span:last-child').textContent = '开始获取凭证';
    }
}

function showCredentials() {
    credentialsSection.classList.remove('hidden');
    stepsSection.classList.add('hidden');
    startBtn.parentElement.classList.add('hidden');

    // Format credentials for display
    const displayCredentials = {
        fcm_credentials: currentCredentials.fcm_credentials,
        expo_push_token: currentCredentials.expo_push_token
    };
    credentialsPreview.textContent = JSON.stringify(displayCredentials, null, 2);
}

function hideCredentials() {
    credentialsSection.classList.add('hidden');
    stepsSection.classList.remove('hidden');
    startBtn.parentElement.classList.remove('hidden');
}

function showError(message) {
    errorSection.classList.remove('hidden');
    errorMessage.textContent = message;
}

function hideError() {
    errorSection.classList.add('hidden');
}

function resetFlow() {
    currentCredentials = null;
    chrome.storage.local.remove(['credentials']);
    hideCredentials();
    hideError();
    updateStatus('准备就绪');
    [1, 2, 3].forEach(i => updateStep(i, null));
}

async function copyCredentials() {
    if (!currentCredentials) return;

    try {
        const credentialsJson = JSON.stringify({
            fcm_credentials: currentCredentials.fcm_credentials,
            expo_push_token: currentCredentials.expo_push_token
        }, null, 2);

        await navigator.clipboard.writeText(credentialsJson);
        showNotification('凭证已复制到剪贴板');
    } catch (error) {
        showNotification('复制失败: ' + error.message, 'error');
    }
}

function downloadCredentials() {
    if (!currentCredentials) return;

    const credentialsJson = JSON.stringify({
        fcm_credentials: currentCredentials.fcm_credentials,
        expo_push_token: currentCredentials.expo_push_token
    }, null, 2);

    const blob = new Blob([credentialsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rustplus_credentials.json';
    a.click();
    URL.revokeObjectURL(url);

    showNotification('凭证已下载');
}

function showNotification(message, type = 'success') {
    // Simple notification - could be enhanced with toast UI
    const statusText = statusIndicator.querySelector('.status-text');
    const originalText = statusText.textContent;
    statusText.textContent = message;

    setTimeout(() => {
        statusText.textContent = originalText;
    }, 2000);
}
