/**
 * Rust+ Credentials Helper - Injected Page Script
 * 此文件作为外部脚本注入到页面上下文中，绕过 CSP 限制
 */

(function () {
    'use strict';

    console.log('[Rust+ Inject] Script loaded');

    // 标记扩展已安装
    window.rustPlusExtensionInstalled = true;

    // 创建 ReactNativeWebView mock
    function createReactNativeWebView() {
        window.ReactNativeWebView = {
            __rustplus__: true,
            postMessage: function (message) {
                console.log('[Rust+ Inject] 拦截 ReactNativeWebView.postMessage:', message);

                // 尝试解析消息，打印完整内容
                try {
                    const data = typeof message === 'string' ? JSON.parse(message) : message;
                    console.log('[Rust+ Inject] 解析后的完整数据:', JSON.stringify(data, null, 2));
                    console.log('[Rust+ Inject] 数据字段:', Object.keys(data));
                } catch (e) {
                    console.log('[Rust+ Inject] 原始消息:', message);
                }

                // 发送自定义事件到 content script
                window.dispatchEvent(new CustomEvent('__rustplus_auth__', {
                    detail: { message: message }
                }));
            }
        };
    }

    // 立即创建
    createReactNativeWebView();

    // 定期检查并重新创建（防止被页面脚本覆盖）
    setInterval(function () {
        if (!window.ReactNativeWebView ||
            !window.ReactNativeWebView.__rustplus__ ||
            typeof window.ReactNativeWebView.postMessage !== 'function') {
            console.log('[Rust+ Inject] 重新注入 ReactNativeWebView');
            createReactNativeWebView();
        }
    }, 100);

    console.log('[Rust+ Inject] ReactNativeWebView mock 已创建');

})();
