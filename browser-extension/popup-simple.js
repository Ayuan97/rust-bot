/**
 * Rust+ Credentials Helper - Simple Popup Script
 * 只有一个功能：打开登录页面
 */

document.addEventListener('DOMContentLoaded', async () => {
    const startBtn = document.getElementById('startBtn');
    const viewResultBtn = document.getElementById('viewResultBtn');
    const clearBtn = document.getElementById('clearBtn');
    const tokenStatus = document.getElementById('tokenStatus');
    const viewTokenLink = document.getElementById('viewTokenLink');

    // 检查是否已有 token
    const result = await chrome.storage.local.get(['authData']);
    if (result.authData && result.authData.authToken) {
        tokenStatus.classList.remove('hidden');
        viewResultBtn.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
    }

    // 开始登录
    startBtn.addEventListener('click', async () => {
        // 清除旧数据
        await chrome.storage.local.remove(['authData']);

        // 打开登录页面
        chrome.tabs.create({
            url: 'https://companion-rust.facepunch.com/login',
            active: true
        });

        // 关闭 popup
        window.close();
    });

    // 查看结果
    viewResultBtn.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('result.html'),
            active: true
        });
        window.close();
    });

    // 查看 token 链接
    viewTokenLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({
            url: chrome.runtime.getURL('result.html'),
            active: true
        });
        window.close();
    });

    // 清除 token
    clearBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove(['authData', 'credentials']);
        tokenStatus.classList.add('hidden');
        viewResultBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
    });
});
