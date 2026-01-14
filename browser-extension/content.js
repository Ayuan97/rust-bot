/**
 * Rust+ Credentials Helper - Content Script
 * 注入外部脚本文件到 Rust+ 页面，捕获 Auth Token
 */

(function () {
    'use strict';

    // 防止重复注入
    if (window.__rustPlusCredentialsHelper) return;
    window.__rustPlusCredentialsHelper = true;

    console.log('[Rust+ Helper] Content script loaded:', window.location.href);

    // 注入外部脚本（绕过 CSP）
    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function () {
            console.log('[Rust+ Helper] inject.js 已加载');
            this.remove(); // 加载后移除 script 标签
        };
        script.onerror = function () {
            console.error('[Rust+ Helper] inject.js 加载失败');
        };

        // 尽早注入
        (document.head || document.documentElement).appendChild(script);
    }

    // 监听来自注入脚本的事件
    window.addEventListener('__rustplus_auth__', function (e) {
        console.log('[Rust+ Helper] 收到 auth 事件');

        try {
            const message = e.detail?.message;
            if (!message) return;

            const data = typeof message === 'string' ? JSON.parse(message) : message;
            console.log('[Rust+ Helper] 解析的数据:', data);

            if (data && (data.Token || data.token)) {
                const authToken = data.Token || data.token;
                const steamId = data.SteamId || data.steamId;

                console.log('[Rust+ Helper] 发送 token 到 background');

                // 发送到 background script
                chrome.runtime.sendMessage({
                    type: 'RUSTPLUS_AUTH_TOKEN',
                    authToken: authToken,
                    steamId: steamId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Rust+ Helper] 发送失败:', chrome.runtime.lastError);
                    } else {
                        console.log('[Rust+ Helper] 发送成功');
                    }
                });
            }
        } catch (err) {
            console.error('[Rust+ Helper] 解析失败:', err);
        }
    });

    // 检查 URL 参数中的 token
    function checkUrlForToken() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || params.get('Token');
        if (token) {
            console.log('[Rust+ Helper] 从 URL 获取到 token');
            chrome.runtime.sendMessage({
                type: 'RUSTPLUS_AUTH_TOKEN',
                authToken: token
            });
        }
    }

    // 注入脚本 - 尽早执行
    injectScript();

    // 检查 URL
    checkUrlForToken();

    // 监听 URL 变化
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkUrlForToken();
        }
    }).observe(document, { subtree: true, childList: true });

})();
