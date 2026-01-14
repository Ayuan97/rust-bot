/**
 * Rust+ Credentials Helper - Injected Page Script
 * 在页面上下文中运行，拦截 ReactNativeWebView.postMessage
 * 
 * Rust+ 官方 App 使用 ReactNativeWebView.postMessage 来传递认证数据，
 * 我们通过定义一个假的 ReactNativeWebView 对象来捕获这些数据。
 */

(function () {
    'use strict';

    console.log('[Rust+ Credentials Helper] Injected script loaded');

    // Create a mock ReactNativeWebView object
    // This mimics what the Rust+ mobile app provides
    window.ReactNativeWebView = {
        postMessage: function (message) {
            console.log('[Rust+ Credentials Helper] Intercepted ReactNativeWebView.postMessage:', message);

            try {
                // Parse the message
                const data = typeof message === 'string' ? JSON.parse(message) : message;

                // Check if this is auth data
                if (data && (data.token || data.Token || data.authToken || data.AuthToken)) {
                    const authToken = data.token || data.Token || data.authToken || data.AuthToken;
                    const steamId = data.steamId || data.SteamId || data.playerId || data.PlayerId;

                    console.log('[Rust+ Credentials Helper] Found auth token!');

                    // Send to content script via window.postMessage
                    window.postMessage({
                        type: 'RUSTPLUS_AUTH_DATA',
                        authToken: authToken,
                        steamId: steamId
                    }, '*');
                }
            } catch (error) {
                console.error('[Rust+ Credentials Helper] Error parsing message:', error);

                // Try sending raw message if it looks like a token
                if (typeof message === 'string' && message.length > 20) {
                    window.postMessage({
                        type: 'RUSTPLUS_AUTH_DATA',
                        authToken: message
                    }, '*');
                }
            }
        }
    };

    // Also override window.postMessage in case it's used differently
    const originalPostMessage = window.postMessage.bind(window);
    window.postMessage = function (message, targetOrigin, transfer) {
        // Check if this might be auth data
        if (message && typeof message === 'object') {
            const token = message.token || message.Token || message.authToken || message.AuthToken;
            if (token) {
                console.log('[Rust+ Credentials Helper] Intercepted window.postMessage with token');
                window.dispatchEvent(new CustomEvent('rustplus_auth', { detail: { token } }));
            }
        }
        return originalPostMessage(message, targetOrigin, transfer);
    };

    // Listen for navigation to success page
    const observer = new MutationObserver((mutations) => {
        // Check if we're on a success page or if there's a token displayed
        const pageText = document.body?.innerText || '';

        // Look for success indicators
        if (pageText.includes('Successfully') || pageText.includes('成功') ||
            pageText.includes('Paired') || pageText.includes('已配对')) {
            console.log('[Rust+ Credentials Helper] Detected success page');
        }
    });

    // Start observing when DOM is ready
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

})();
