# Rust+ 事件指南

本文档说明了连接到 Rust+ 服务器后，系统可以自动检测和触发的各种事件类型。

## 概述

系统通过监听 Rust+ API 的广播消息（broadcast）来检测游戏内的各种事件。这些事件会通过 WebSocket 实时推送到前端。

## 可用事件类型

### 1. 服务器连接事件

#### `server:connected`
服务器连接成功时触发。

**数据格式：**
```javascript
{
  serverId: string  // 服务器 ID
}
```

#### `server:disconnected`
服务器断开连接时触发。

**数据格式：**
```javascript
{
  serverId: string  // 服务器 ID
}
```

#### `server:error`
服务器发生错误时触发。

**数据格式：**
```javascript
{
  serverId: string,  // 服务器 ID
  error: string      // 错误信息
}
```

---

### 2. 队伍相关事件

#### `team:message`
收到队伍聊天消息时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  message: string,    // 消息内容
  name: string,       // 发送者名称
  steamId: string,    // 发送者 Steam ID
  time: number        // 时间戳
}
```

#### `team:changed`
队伍状态发生变化时触发（原始事件，包含完整的队伍信息）。

**数据格式：**
```javascript
{
  serverId: string,
  data: {
    playerId: string,
    teamInfo: {
      leaderSteamId: string,
      members: Array<{
        steamId: string,
        name: string,
        x: number,
        y: number,
        isOnline: boolean,
        isAlive: boolean,
        spawnTime: number,
        deathTime: number
      }>,
      mapNotes: Array,
      leaderMapNotes: Array
    }
  }
}
```

---

### 3. 玩家状态事件

这些是从 `team:changed` 事件中解析出的具体玩家状态变化。

#### `player:died` ⭐ 新增
队伍成员死亡时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  steamId: string,    // 玩家 Steam ID
  name: string,       // 玩家名称
  deathTime: number,  // 死亡时间戳
  x: number,          // 死亡位置 X 坐标
  y: number           // 死亡位置 Y 坐标
}
```

#### `player:spawned` ⭐ 新增
队伍成员重生时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  steamId: string,    // 玩家 Steam ID
  name: string,       // 玩家名称
  spawnTime: number,  // 重生时间戳
  x: number,          // 重生位置 X 坐标
  y: number           // 重生位置 Y 坐标
}
```

#### `player:online` ⭐ 新增
队伍成员上线时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  steamId: string,    // 玩家 Steam ID
  name: string,       // 玩家名称
  isAlive: boolean,   // 是否存活
  x: number,          // 位置 X 坐标
  y: number           // 位置 Y 坐标
}
```

#### `player:offline` ⭐ 新增
队伍成员下线时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  steamId: string,    // 玩家 Steam ID
  name: string        // 玩家名称
}
```

---

### 4. 设备/实体事件

#### `entity:changed`
智能设备状态改变时触发（如智能开关、储物监视器等）。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  entityId: number,   // 设备 ID
  value: boolean,     // 设备值（开/关）
  capacity: number    // 容量（储物监视器）
}
```

---

### 5. 氏族相关事件

#### `clan:changed` ⭐ 新增
氏族信息发生变化时触发。

**数据格式：**
```javascript
{
  serverId: string,
  data: {
    clanInfo: {
      clanId: string,
      name: string,
      motd: string,
      members: Array,
      roles: Array,
      // ... 更多氏族信息
    }
  }
}
```

#### `clan:message` ⭐ 新增
收到氏族聊天消息时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  clanId: string,     // 氏族 ID
  message: string,    // 消息内容
  name: string,       // 发送者名称
  steamId: string,    // 发送者 Steam ID
  time: number        // 时间戳
}
```

---

### 6. 摄像头事件

#### `camera:subscribing`
开始订阅摄像头时触发。

#### `camera:subscribed`
摄像头订阅成功时触发。

#### `camera:unsubscribed`
摄像头取消订阅时触发。

#### `camera:render`
摄像头画面更新时触发。

**数据格式：**
```javascript
{
  serverId: string,   // 服务器 ID
  cameraId: string,   // 摄像头 ID
  image: string       // Base64 编码的图像（data URL 格式）
}
```

#### `camera:rays`
摄像头射线数据（用于渲染 3D 场景）。

---

### 7. 调试事件

#### `rust:message`
接收到的原始 Rust+ 消息（用于调试）。

**数据格式：**
```javascript
{
  serverId: string,
  raw: Object  // 原始 protobuf 消息对象
}
```

---

## 前端使用示例

### 监听玩家死亡事件

```javascript
import { socket } from './services/socket';

// 监听玩家死亡
socket.on('player:died', (data) => {
  console.log(`${data.name} 死亡了！位置：(${data.x}, ${data.y})`);
  // 可以在这里触发通知、播放音效等
});
```

### 监听玩家重生事件

```javascript
socket.on('player:spawned', (data) => {
  console.log(`${data.name} 重生了！`);
  // 可以在地图上更新玩家位置
});
```

### 监听玩家上线/下线

```javascript
socket.on('player:online', (data) => {
  console.log(`${data.name} 上线了`);
});

socket.on('player:offline', (data) => {
  console.log(`${data.name} 下线了`);
});
```

### 监听队伍消息

```javascript
socket.on('team:message', (data) => {
  console.log(`[${data.name}]: ${data.message}`);
  // 显示在聊天面板中
});
```

### 监听设备状态变化

```javascript
socket.on('entity:changed', (data) => {
  console.log(`设备 ${data.entityId} 状态: ${data.value ? '开' : '关'}`);
  // 更新 UI 中的设备状态
});
```

---

## 实现原理

### 玩家状态检测

玩家的死亡、重生、上线、下线事件是通过比较 `team:changed` 广播中的队伍成员状态来检测的：

1. **死亡检测**：`isAlive` 从 `true` 变为 `false`
2. **重生检测**：`isAlive` 从 `false` 变为 `true`
3. **上线检测**：`isOnline` 从 `false` 变为 `true`
4. **下线检测**：`isOnline` 从 `true` 变为 `false`

系统会自动缓存上一次的队伍状态，并在每次收到 `team:changed` 事件时进行对比，从而触发相应的具体事件。

### 初始状态

连接到服务器后，系统会立即调用 `getTeamInfo()` API 获取当前队伍状态并缓存，作为后续状态变化检测的基准。

---

## 注意事项

1. **首次连接**：由于需要有上一次的状态才能检测变化，所以**首次连接时不会触发玩家状态事件**，需要等到状态发生变化时才会触发。

2. **事件顺序**：原始的 `team:changed` 事件会在具体的玩家状态事件（如 `player:died`）之前触发。

3. **队伍要求**：玩家状态事件只能检测**队伍成员**的状态变化，无法检测非队友的状态。

4. **事件频率**：Rust+ API 会定期发送 `team:changed` 广播，通常是每隔几秒或当状态真正发生变化时。

5. **调试建议**：可以监听 `rust:message` 事件查看所有原始消息，有助于理解 API 的行为。

---

## 后续扩展

可以基于这些事件实现更多功能：

- 📊 统计玩家死亡次数
- 🗺️ 在地图上显示队友位置
- 🔔 玩家死亡时发送推送通知
- 📝 记录队伍活动日志
- 🤖 实现自动回复机器人
- ⚡ 设备状态监控和自动化

---

## 相关文件

- `/backend/src/services/rustplus.service.js` - Rust+ 服务核心逻辑
- `/backend/src/services/websocket.service.js` - WebSocket 事件转发
- `/backend/lib/rustplus/rustplus.proto` - Protobuf 协议定义

