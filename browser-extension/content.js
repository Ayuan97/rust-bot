/**
 * Rust+ Credentials Helper - Content Script
 * 注入到 Rust+ 页面，捕获 Auth Token
 */

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.__rustPlusCredentialsHelper) {
        return;
    }
    window.__rustPlusCredentialsHelper = true;

    console.log('[Rust+ Credentials Helper] Content script loaded');

    // Inject the page script to intercept ReactNativeWebView.postMessage
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // Listen for messages from injected script
    window.addEventListener('message', (event) => {
        // Only accept messages from same origin
        if (event.source !== window) return;

        if (event.data && event.data.type === 'RUSTPLUS_AUTH_DATA') {
            console.log('[Rust+ Credentials Helper] Received auth data from page');

            // Send to background/popup
            chrome.runtime.sendMessage({
                type: 'RUSTPLUS_AUTH_TOKEN',
                authToken: event.data.authToken,
                steamId: event.data.steamId
            });
        }
    });

    // Also try to capture token from URL (older flow)
    function checkUrlForToken() {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');

        if (token) {
            console.log('[Rust+ Credentials Helper] Found token in URL');
            chrome.runtime.sendMessage({
                type: 'RUSTPLUS_AUTH_TOKEN',
                authToken: token
            });
        }
    }

    // Check immediately and on URL changes
    checkUrlForToken();

    // Observe URL changes (for SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkUrlForToken();
        }
    }).observe(document, { subtree: true, childList: true });

})();
