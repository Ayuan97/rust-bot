# UserFCMManager 模块文档

> 文件: `backend/src/services/user-fcm-manager.js`
> 行数: 839 | 类型: 用户实例服务

---

## 1. 概述

`UserFCMManager` 是用户级别的 **FCM 推送监听管理器**，负责接收 Google FCM 推送消息，解析服务器/设备配对通知。支持 SOCKS5 代理连接。

---

## 2. 核心职责

| 职责 | 描述 |
|------|------|
| **FCM 监听** | 注册和监听 FCM 推送消息 |
| **配对解析** | 解析服务器/设备配对通知 |
| **凭证管理** | 加载、保存、验证 FCM 凭证 |
| **代理支持** | 通过 SOCKS5 代理连接 FCM |

---

## 3. 公开方法

### 3.1 注册流程

| 方法 | 描述 |
|------|------|
| `registerFCM()` | 完整注册流程（获取凭证+Expo Token） |
| `completeRegistration(fcmCredentials, expoPushToken, authToken)` | 使用 Auth Token 完成注册 |
| `getExpoPushToken(fcmToken)` | 获取 Expo Push Token |
| `registerWithRustPlusAPI(authToken, expoPushToken)` | 注册到 Rust+ API |

### 3.2 监听控制

| 方法 | 描述 |
|------|------|
| `start(credentials)` | 开始监听 |
| `stop(preventReconnect)` | 停止监听 |
| `testConnection(credentials)` | 测试凭证连接 |

### 3.3 凭证管理

| 方法 | 描述 |
|------|------|
| `loadCredentials(credentials)` | 加载凭证 |
| `getCredentials()` | 获取凭证 |
| `clearCredentials()` | 清除凭证 |
| `setManualCredentials(data)` | 手动设置凭证 |
| `getStatus()` | 获取监听状态 |

### 3.4 代理配置

| 方法 | 描述 |
|------|------|
| `setProxyAgent(agent)` | 设置代理 Agent |
| `setProxyConfig(config)` | 设置 SOCKS5 配置 |

---

## 4. 事件列表

| 事件 | 触发时机 |
|------|----------|
| `server:paired` | 收到服务器配对推送 |
| `entity:paired` | 收到设备配对推送 |
| `listening` | 监听已启动 |
| `stopped` | 监听已停止 |
| `error` | 发生错误 |

---

## 5. 使用示例

```javascript
const fcmManager = new UserFCMManager(userId);

// 设置代理
fcmManager.setProxyConfig({ host: '127.0.0.1', port: 10808 });

// 加载凭证并开始监听
await fcmManager.start(savedCredentials);

// 监听配对事件
fcmManager.on('server:paired', (data) => {
  console.log('新服务器配对:', data.name);
});
```
