/**
 * Rust+ Credentials Helper - Background Service Worker
 * 处理扩展通信、凭证捕获和外部消息
 */

// 保存捕获的认证数据
let capturedAuthData = null;
let waitingTabId = null;
let loginTabId = null;

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] 收到消息:', message.type);

    if (message.type === 'RUSTPLUS_AUTH_TOKEN') {
        console.log('[Background] 收到 Rust+ Auth Token');
        console.log('[Background] 完整数据:', message);

        capturedAuthData = {
            authToken: message.authToken,
            steamId: message.steamId,
            issued: message.issued,
            expiry: message.expiry,
            rawData: message.rawData,
            capturedAt: Date.now()
        };

        console.log('[Background] issued:', message.issued);
        console.log('[Background] expiry:', message.expiry);

        // 保存到存储
        chrome.storage.local.set({ authData: capturedAuthData });

        // 关闭登录标签页
        if (loginTabId) {
            chrome.tabs.remove(loginTabId).catch(() => { });
            loginTabId = null;
        }

        // 自动打开结果页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('result.html'),
            active: true
        });

        // 通知所有打开的 popup
        chrome.runtime.sendMessage({
            type: 'AUTH_CAPTURED',
            data: capturedAuthData
        }).catch(() => { });

        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'GET_AUTH_DATA') {
        sendResponse({ data: capturedAuthData });
        return true;
    }

    if (message.type === 'CLEAR_AUTH_DATA') {
        capturedAuthData = null;
        chrome.storage.local.remove(['authData']);
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'SET_WAITING_TAB') {
        waitingTabId = message.tabId;
        sendResponse({ success: true });
        return true;
    }
});

// 监听来自外部网页的消息 (前端 Dashboard)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    console.log('[Background] 收到外部消息:', message.type, 'from:', sender.origin);

    // 验证来源
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://rustplusplus-credentials.netlify.app'
    ];

    if (!allowedOrigins.some(origin => sender.origin.startsWith(origin.replace('/*', '')))) {
        console.log('[Background] 来源不允许:', sender.origin);
        sendResponse({ error: 'Origin not allowed' });
        return;
    }

    switch (message.type) {
        case 'PING':
            // 检查扩展是否已安装
            sendResponse({ installed: true, version: '1.0.0' });
            break;

        case 'START_LOGIN':
            // 开始登录流程
            capturedAuthData = null;
            chrome.tabs.create({
                url: 'https://companion-rust.facepunch.com/login',
                active: true
            }, (tab) => {
                waitingTabId = sender.tab?.id;
                sendResponse({ success: true, loginTabId: tab.id });
            });
            return true; // 异步响应

        case 'GET_AUTH_DATA':
            // 获取捕获的认证数据
            sendResponse({ data: capturedAuthData });
            break;

        case 'GET_CREDENTIALS':
            // 获取完整凭证（从存储）
            chrome.storage.local.get(['credentials'], (result) => {
                sendResponse({ credentials: result.credentials || null });
            });
            return true; // 异步响应

        case 'SAVE_CREDENTIALS':
            // 保存凭证
            chrome.storage.local.set({ credentials: message.credentials }, () => {
                sendResponse({ success: true });
            });
            return true; // 异步响应

        default:
            sendResponse({ error: 'Unknown message type' });
    }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 当 Rust+ 页面加载完成时，确保注入 content script
    if (changeInfo.status === 'complete' && tab.url?.includes('companion-rust.facepunch.com')) {
        console.log('[Background] Rust+ 页面加载完成');
    }
});

// 安装时初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Background] 扩展已安装/更新:', details.reason);

    // 清除旧数据
    chrome.storage.local.get(['settings'], (result) => {
        if (!result.settings) {
            chrome.storage.local.set({
                settings: {
                    apiUrl: 'http://localhost:3000'
                }
            });
        }
    });
});
