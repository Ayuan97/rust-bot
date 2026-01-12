# WebSocketService 模块文档

> 文件: `backend/src/services/websocket.service.js`
> 行数: 622 | 类型: 单例服务

---

## 1. 概述

`WebSocketService` 是基于 **Socket.io** 的实时通信服务，负责处理客户端连接、JWT 认证、事件转发和房间隔离。

---

## 2. 核心职责

| 职责 | 描述 |
|------|------|
| **连接管理** | 管理 Socket.io 客户端连接 |
| **JWT 认证** | 验证连接时的 JWT Token |
| **房间隔离** | 使用 `user:${userId}` 房间隔离用户数据 |
| **事件转发** | 监听 GlobalServiceManager 事件并转发 |

---

## 3. 公开方法

| 方法 | 描述 |
|------|------|
| `initialize(server, corsOrigin)` | 初始化 Socket.io 服务器 |
| `authenticateSocket(socket, next)` | JWT 认证中间件 |
| `setupEventHandlers()` | 设置客户端事件处理 |
| `setupGlobalServiceListeners()` | 监听全局服务事件 |
| `broadcast(event, data)` | 广播消息 |
| `getIO()` | 获取 Socket.io 实例 |

---

## 4. 客户端事件

| 事件 | 描述 |
|------|------|
| `server:connect` | 连接到游戏服务器 |
| `server:disconnect` | 断开服务器 |
| `team:sendMessage` | 发送队伍消息 |
| `device:toggle` | 切换设备状态 |
| `camera:subscribe` | 订阅摄像头 |
| `map:getMarkers` | 获取地图标记 |

---

## 5. 房间隔离

```javascript
// 向特定用户广播
io.to(`user:${userId}`).emit('event', data);

// 客户端连接时自动加入房间
socket.join(`user:${socket.userId}`);
```
