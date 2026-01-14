/**
 * Rust+ Credentials Helper - Background Service Worker
 * 处理后台任务和消息传递
 */

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Rust+ Credentials Helper installed:', details.reason);

    // Set default settings
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

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'RUSTPLUS_AUTH_TOKEN':
            // Forward auth token to popup (handled by popup's listener)
            console.log('收到 Rust+ Auth Token');
            break;

        case 'GET_SETTINGS':
            chrome.storage.local.get(['settings'], (result) => {
                sendResponse(result.settings || { apiUrl: 'http://localhost:3000' });
            });
            return true; // Async response

        case 'SAVE_CREDENTIALS':
            chrome.storage.local.set({ credentials: message.credentials }, () => {
                sendResponse({ success: true });
            });
            return true; // Async response

        case 'GET_CREDENTIALS':
            chrome.storage.local.get(['credentials'], (result) => {
                sendResponse(result.credentials || null);
            });
            return true; // Async response

        case 'CLEAR_CREDENTIALS':
            chrome.storage.local.remove(['credentials'], () => {
                sendResponse({ success: true });
            });
            return true; // Async response

        default:
            console.log('Unknown message type:', message.type);
    }
});

// Handle tab updates for auth token capture
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check if Rust+ login page completed
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('companion-rust.facepunch.com')) {
            // Inject content script if not already
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            }).catch(() => {
                // Script may already be injected via manifest
            });
        }
    }
});
