# Rust+ Credentials Helper

一个帮助获取 Rust+ FCM 凭证的 Edge/Chrome 浏览器插件。

## 功能

- 🔐 自动完成 FCM 设备注册
- 🎮 Steam 账号授权
- 📋 一键复制凭证
- 💾 下载凭证 JSON 文件

## 安装

### 开发模式加载

1. 打开 Edge 浏览器，访问 `edge://extensions/`
2. 开启右上角的 **开发人员模式**
3. 点击 **加载解压缩的扩展**
4. 选择 `browser-extension` 文件夹

### Chrome 安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `browser-extension` 文件夹

## 使用

### 前提条件

1. 确保后端服务正在运行 (`npm run dev` in `backend/`)
2. 后端服务默认地址: `http://localhost:3000`

### 获取凭证

1. 点击浏览器工具栏中的插件图标
2. 点击 **开始获取凭证** 按钮
3. 等待 FCM 注册完成（第 1 步）
4. 在打开的新标签页中用 Steam 账号登录
5. 登录成功后凭证会自动获取
6. 复制或下载凭证 JSON

### 高级设置

如果后端服务不在默认地址，可以在插件设置中修改：

1. 点击 **⚙️ 高级设置**
2. 输入后端 API 地址
3. 点击 **保存**

## 文件结构

```
browser-extension/
├── manifest.json      # 插件配置（Manifest V3）
├── popup.html         # 弹窗 UI
├── popup.css          # 弹窗样式
├── popup.js           # 弹窗逻辑
├── background.js      # 后台 Service Worker
├── content.js         # 页面注入脚本
├── inject.js          # ReactNativeWebView 拦截
└── icons/             # 插件图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 工作原理

1. **FCM 注册**: 插件调用后端 API，后端使用 `@liamcottle/push-receiver` 完成 FCM 设备注册
2. **Steam 登录**: 打开 Rust+ 官方登录页面，通过注入脚本拦截 `ReactNativeWebView.postMessage` 获取 auth token
3. **Rust+ 注册**: 将 FCM token 和 Steam auth token 提交到 Facepunch API 完成配对
4. **凭证展示**: 将完整凭证展示给用户，支持复制和下载

## 故障排除

### FCM 注册失败

- 检查后端服务是否运行
- 检查后端是否可以访问 Google FCM（可能需要代理）

### Steam 登录超时

- 确保浏览器允许弹窗
- 登录超时为 5 分钟，请在此时间内完成登录

### 无法捕获 Auth Token

- 刷新 Rust+ 登录页面后重试
- 确保插件内容脚本正确注入（检查控制台日志）
