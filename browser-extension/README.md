# Rust+ Credentials Helper 浏览器插件

这是一个用于自动获取 Rust+ 凭证的 Chrome/Edge 浏览器扩展。

它解决了手动获取 Rust+ 凭证的两个核心问题：
1. **Steam 登录与 Token 捕获**：自动处理 Facepunch 登录页面的认证数据。
2. **FCM 注册**：直接与 `api.rustplusplus.com` 通信，获取 Google FCM 推送凭证。

## 功能

- **一键登录**：点击插件按钮直接跳转 Steam 登录。
- **自动捕获**：集成 Content Script，在 Steam 登录完成后自动捕获 `rustplus-auth-token`。
- **自动注册 FCM**：使用捕获的 Token 自动注册 FCM 设备。
- **格式化输出**：直接生成 Rust+ Web Dashboard 所需的完整 JSON 配置，以及 RustPlusPlus Bot 所需的命令格式。

## 安装方法

1. 打开浏览器扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. 开启右上角的 **"开发者模式"**。
3. 点击 **"加载已解压的扩展程序"**。
4. 选择本项目中的 `browser-extension` 文件夹。

## 使用步骤

1. 点击浏览器右上角的 Rust+ 插件图标。
2. 点击 **"🔐 使用 Steam 登录"** 按钮。
3. 在新弹出的标签页中完成 Steam 登录授权。
4. 登录成功后，插件会自动跳转到结果页面。
5. 等待 FCM 注册完成（通常只需几秒）。
6. 分别复制 **完整配置 JSON** (用于 Dashboard) 或 **命令** (用于 Discord Bot)。

## 安全说明

本插件代码完全开源，所有数据仅用于：
1. 本地存储（`chrome.storage.local`）用于在页面间传递数据。
2. 发送至 `api.rustplusplus.com` 用于注册 FCM（这是 Rust+ 社区广泛使用的公共 API）。
3. 你的 Rust+ Auth Token 和 Steam ID 仅显示在结果页面供你复制，不会发送给任何第三方服务器（除了 FCM 注册过程需要验证）。

## 目录结构

- `manifest.json`: 插件配置文件
- `background.js`: 后台服务，处理消息传递
- `content.js`: 注入到 Facepunch 页面，负责捕获 Token
- `inject.js`: 注入到页面上下文，绕过 CSP 限制捕获 ReactNativeWebView 消息
- `popup.html` & `popup-simple.js`: 插件弹窗界面
- `result.html` & `result.js`: 结果展示与 FCM 注册逻辑
