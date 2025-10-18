# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

**Rust+ Web Dashboard** - 一个基于 Web 的 Rust 游戏服务器管理面板。

- **后端**: Node.js + Express + Socket.io + SQLite
- **前端**: React + Vite + Tailwind CSS
- **核心功能**: 连接 Rust+ 游戏服务器、FCM 推送监听、实时聊天、智能设备控制

## 开发命令

### 后端 (`backend/`)

```bash
# 开发模式（带自动重载）
npm run dev

# 生产模式
npm start
```

### 前端 (`frontend/`)

```bash
# 开发服务器 (http://localhost:5173)
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 同时启动前后端

```bash
# 在项目根目录执行
./start.sh
```

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      浏览器客户端                        │
│                  (React, localhost:5173)                │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
         REST API (Axios)      WebSocket (Socket.io)
                │                     │
┌───────────────┴─────────────────────┴───────────────────┐
│              后端服务 (Express, localhost:3000)          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              WebSocket 服务层                    │   │
│  │    (广播事件给所有连接的客户端)                  │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────┼──────────────────────────────┐   │
│  │              三大核心服务                         │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ RustPlusService (游戏服务器连接池)      │    │   │
│  │  │ - 管理多个 Rust+ 服务器连接             │    │   │
│  │  │ - 处理游戏内事件 (聊天、设备状态等)     │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ FCMService (推送通知监听器)             │    │   │
│  │  │ - 监听 Rust+ 配对通知                   │    │   │
│  │  │ - 处理玩家登录/死亡/警报等推送          │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ WebSocketService (实时通信桥接)         │    │   │
│  │  │ - 处理客户端 WebSocket 连接             │    │   │
│  │  │ - 路由命令到 RustPlusService             │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────┘  │
│                     │                                    │
│  ┌──────────────────┴──────────────────────────────┐   │
│  │              数据层 (models/)                    │   │
│  │  - Storage: 服务器、设备、事件日志              │   │
│  │  - ConfigStorage: FCM 凭证存储                   │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────┴──────────────────────────────┐   │
│  │         SQLite 数据库 (data/database.db)         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 关键架构模式

### 1. 服务层通信 (EventEmitter 发布/订阅)

所有服务都继承自 Node.js `EventEmitter`，通过事件进行解耦通信：

**示例流程：FCM 配对 → 自动连接服务器**

```javascript
// 1. FCM 服务接收配对推送
FCMService.handleFCMMessage()
    ↓ emit
'server:paired' 事件 (含 IP、端口、Token)
    ↓
// 2. app.js 监听该事件
fcmService.on('server:paired', (serverInfo) => {
    // 保存到数据库
    storage.addServer(serverInfo);
    // 自动连接
    rustPlusService.connect(serverInfo);
});
    ↓
// 3. RustPlusService 连接成功
rustPlusService.emit('server:connected', serverId)
    ↓
// 4. WebSocketService 广播给所有客户端
io.emit('server:connected', { serverId, ... })
```

### 2. 单例模式

所有服务导出为单例实例：

```javascript
// services/fcm.service.js
class FCMService extends EventEmitter { }
export default new FCMService();  // ← 单例

// 使用时直接导入
import fcmService from './services/fcm.service.js';
```

### 3. 前后端双通道通信

- **REST API (Axios)**: CRUD 操作、配置管理
- **WebSocket (Socket.io)**: 实时事件推送、命令执行

```javascript
// 前端示例
// 添加服务器 (REST)
await api.addServer(serverInfo);

// 连接服务器 (WebSocket)
socket.emit('server:connect', { serverId });

// 监听实时事件 (WebSocket)
socket.on('team:message', (message) => { ... });
```

## 重要实现细节

### 1. FCM 凭证管理（关键！）

**凭证格式要求**：只支持 **GCM 格式**

```javascript
{
  gcm: {
    androidId: "...",
    securityToken: "..."
  },
  steam: {
    steamId: "..."  // 可选
  }
}
```

**三种凭证加载策略（按优先级）**：

1. **数据库** - 之前保存的凭证（最快）
2. **RustPlus CLI** - 从 `~/.rustplus/credentials` 加载
3. **手动输入** - 通过 `/api/pairing/credentials/manual` 提交

**关键错误避免**：

❌ **错误**: 使用不存在的 API
```javascript
// 这些方法不存在！
RustPlus.FCM.register()  // ❌
RustPlus.FCM.listen()    // ❌
```

✅ **正确**: 使用 push-receiver 库
```javascript
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';

// 注册
const credentials = await AndroidFCM.register(apiKey, projectId, ...);

// 监听
const client = new PushReceiverClient(androidId, securityToken, []);
client.on('ON_DATA_RECEIVED', (data) => { ... });
await client.connect();
```

**完整实现参考**: `backend/src/services/fcm.service.js`

### 2. 数据库 Schema 变更

修改数据库结构时，必须添加迁移逻辑：

```javascript
// config.model.js 示例
initDatabase() {
  // 1. 检查旧结构
  const tableInfo = this.db.prepare("PRAGMA table_info(fcm_credentials)").all();
  const hasOldSchema = tableInfo.some(col => col.name === 'fcm_token');

  if (hasOldSchema) {
    // 2. 备份数据
    const oldData = this.db.prepare('SELECT * FROM fcm_credentials').get();

    // 3. 删除旧表
    this.db.exec('DROP TABLE IF EXISTS fcm_credentials');

    // 4. 创建新表
    this.db.exec(`CREATE TABLE fcm_credentials (...)`);

    // 5. 迁移数据
    if (oldData) {
      // 转换格式并插入
    }
  }
}
```

**启动时自动创建**: `backend/data/` 目录在服务器启动时自动创建。

### 3. RustPlus 连接池管理

```javascript
// rustplus.service.js
class RustPlusService {
  constructor() {
    this.servers = new Map();  // serverId → RustPlus 实例
  }

  connect(config) {
    const rustplus = new RustPlus(ip, port, playerId, playerToken);
    this.servers.set(serverId, rustplus);

    rustplus.on('connected', () => {
      this.emit('server:connected', serverId);
    });

    rustplus.connect();
  }
}
```

**注意**：
- 连接状态在内存中，服务器重启后丢失
- 操作前必须检查 `this.servers.has(serverId)`
- 每个服务器独立连接，互不影响

### 4. WebSocket 事件命名规范

**客户端 → 服务器**：
- 操作类: `resource:action` (如 `server:connect`, `device:control`)
- 请求类: `resource:info` (如 `server:info`, `team:info`)

**服务器 → 客户端**：
- 状态类: `resource:state` (如 `server:connected`, `server:disconnected`)
- 推送类: `event:type` (如 `team:message`, `player:login`)
- 响应类: `action:result` (如 `device:control:success`, `message:send:error`)

### 5. 前端服务层封装

**API 服务** (`frontend/src/services/api.js`):
```javascript
// 基础 URL 从环境变量读取
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = {
  getServers: () => axios.get(`${API_URL}/servers`),
  addServer: (data) => axios.post(`${API_URL}/servers`, data),
  // ...
};
```

**Socket 服务** (`frontend/src/services/socket.js`):
```javascript
// 连接配置
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// 导出方法封装
export const socketService = {
  connectToServer: (serverId) => {
    socket.emit('server:connect', { serverId });
  },
  // ...
};
```

## 常见问题和解决方案

### 数据库错误

**问题**: `Cannot open database because the directory does not exist`

**原因**: `/backend/data` 目录不存在

**解决**: 服务器启动时会自动创建。如已启动仍报错，手动创建：
```bash
mkdir -p backend/data
```

---

**问题**: `table fcm_credentials has no column named credentials_json`

**原因**: 旧的数据库 schema 仍在内存中

**解决**:
1. 删除旧数据库: `rm backend/data/database.db`
2. 重启服务器（会自动运行迁移）

### FCM 监听错误

**问题**: `Cannot read properties of undefined (reading 'listen')`

**原因**: 使用了不存在的 `RustPlus.FCM.listen()` API

**解决**: 参考 `backend/src/services/fcm.service.js` 中的 `PushReceiverClient` 实现

---

**问题**: `凭证格式错误：需要 GCM 格式的凭证`

**原因**: 传入了 FCM 格式凭证，但代码只支持 GCM 格式

**解决**: 确保凭证包含 `gcm.androidId` 和 `gcm.securityToken`

### CORS 错误

**问题**: 前端请求被 CORS 策略阻止

**原因**: 前端 URL 未在后端白名单中

**解决**: 在 `backend/.env` 设置:
```env
FRONTEND_URL=http://localhost:5173
```

### 连接失败

**问题**: 前端显示"连接服务器失败"

**原因**:
1. 后端未启动
2. IP/端口/Token 错误
3. 游戏服务器 `app.port` 未开放

**解决**:
1. 确认后端运行: `http://localhost:3000/api/health`
2. 检查服务器配置信息是否正确
3. 确认游戏服务器 `server.cfg` 中 `app.port` 已配置并开放防火墙

## 关键文件说明

### 后端核心

**入口点**
- `backend/src/app.js` - 服务器初始化、服务装配、优雅关闭

**服务层（单例模式）**
- `backend/src/services/rustplus.service.js` - 游戏服务器连接池
- `backend/src/services/fcm.service.js` - FCM 推送监听器
- `backend/src/services/websocket.service.js` - WebSocket 实时通信桥

**数据层**
- `backend/src/models/storage.model.js` - 服务器、设备、事件日志
- `backend/src/models/config.model.js` - FCM 凭证（单例表）

**路由层**
- `backend/src/routes/server.routes.js` - 服务器/设备 CRUD
- `backend/src/routes/pairing.routes.js` - FCM 管理和配对

### 前端核心

**入口点**
- `frontend/src/main.jsx` - React 应用入口
- `frontend/src/App.jsx` - 主应用组件

**服务层**
- `frontend/src/services/api.js` - REST API 客户端
- `frontend/src/services/socket.js` - WebSocket 客户端封装
- `frontend/src/services/pairing.js` - 配对服务 API

**组件层**
- `frontend/src/components/ServerCard.jsx` - 服务器卡片
- `frontend/src/components/ChatPanel.jsx` - 队伍聊天
- `frontend/src/components/DeviceControl.jsx` - 设备控制
- `frontend/src/components/PairingPanel.jsx` - 配对面板
- `frontend/src/components/CredentialsInput.jsx` - 凭证输入

**配置**
- `frontend/vite.config.js` - Vite 配置（代理设置）
- `frontend/tailwind.config.js` - Tailwind 主题配置

## 数据库表结构

### servers - 游戏服务器配置
```sql
CREATE TABLE servers (
  id TEXT PRIMARY KEY,           -- 服务器唯一标识
  name TEXT NOT NULL,            -- 服务器名称
  ip TEXT NOT NULL,              -- IP 地址
  port TEXT NOT NULL,            -- 端口
  player_id TEXT NOT NULL,       -- Steam 64位 ID
  player_token TEXT NOT NULL,    -- 配对令牌（负数）
  created_at INTEGER             -- 创建时间戳
)
```

### devices - 智能设备配置
```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,       -- 外键 → servers.id
  entity_id INTEGER NOT NULL,    -- 设备实体 ID
  name TEXT NOT NULL,            -- 设备名称
  type TEXT,                     -- 设备类型（可选）
  created_at INTEGER,
  UNIQUE(server_id, entity_id)   -- 每个服务器的设备 ID 唯一
)
```

### event_logs - 事件日志
```sql
CREATE TABLE event_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,       -- 外键 → servers.id
  event_type TEXT NOT NULL,      -- 事件类型
  event_data TEXT,               -- JSON 格式事件数据
  created_at INTEGER             -- 时间戳
)
```

### fcm_credentials - FCM 凭证（单例表）
```sql
CREATE TABLE fcm_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- 强制单例
  credentials_json TEXT NOT NULL,         -- 完整 GCM 凭证 JSON
  credential_type TEXT NOT NULL,          -- "FCM" 或 "GCM"
  created_at INTEGER,
  updated_at INTEGER
)
```

## 环境变量

### 后端 (`backend/.env`)
```env
PORT=3000                                    # HTTP 服务器端口
FRONTEND_URL=http://localhost:5173          # 前端 URL（CORS）
```

### 前端 (`frontend/.env`)
```env
VITE_API_URL=http://localhost:3000/api      # 后端 API 地址
VITE_SOCKET_URL=http://localhost:3000       # WebSocket 地址
```

## 服务器初始化流程

后端启动顺序（`backend/src/app.js`）：

1. 加载 `.env` 环境变量
2. 创建 `data/` 目录（如不存在）
3. 初始化 Express + HTTP 服务器
4. 配置 CORS（允许前端跨域）
5. 挂载路由 (`/api/servers`, `/api/pairing`, `/api/health`)
6. 初始化 WebSocketService（Socket.io）
7. 初始化 FCMService（3 种策略加载凭证）
8. 设置优雅关闭处理器（SIGTERM）
9. 监听端口 3000

## 代码风格约定

### 后端

- **模块系统**: ES6 模块 (`import`/`export`)
- **服务模式**: 单例 + EventEmitter
- **日志格式**: Emoji 前缀（✅ 成功、❌ 错误、🔌 连接、📨 消息）
- **错误处理**: 路由层 try/catch，服务层 emit error 事件
- **数据库**: 始终使用 prepared statements（防 SQL 注入）

### 前端

- **组件**: 函数式组件 + Hooks
- **状态管理**: useState, useEffect（未使用 Redux/Zustand）
- **样式**: Tailwind CSS 工具类 + 少量自定义 CSS
- **API 调用**: 通过 `services/` 层封装，不在组件直接调用
- **事件命名**: 小写加冒号分隔（如 `server:connect`）

## Steam 认证流程

**用户必须完成 Steam 认证才能使用配对功能**：

1. 访问 `https://companion-rust.facepunch.com/login`
2. 登录 Steam 账号
3. 获取凭证命令（格式如下）：
   ```
   /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ...
   ```
4. 在 Web 界面填入凭证参数
5. 后端保存凭证并开始监听 FCM 推送
6. 在游戏中点击 Rust+ → Pair with Server
7. 推送自动到达后端 → 保存服务器 → 自动连接

**详细流程**: 参考根目录 `STEAM_AUTH_FLOW.md`

## 项目文档

- `README.md` - 项目介绍、快速开始、使用说明
- `STEAM_AUTH_FLOW.md` - Steam 认证详细流程
- `docs/ARCHITECTURE.md` - 技术架构说明
- `docs/API_CHANNELS.md` - API 和 WebSocket 事件说明
- `start.sh` - 启动脚本（同时启动前后端）

## 调试技巧

### 后端日志

后端使用 Emoji 前缀的彩色日志：
```
✅ FCM 注册成功
🔌 已连接到服务器: MyServer
💬 [PlayerName]: Hello team!
🚨 智能警报: Motion detected
❌ 连接失败: Connection timeout
```

### 前端控制台

在浏览器控制台查看：
- Socket 连接状态
- API 请求/响应
- 实时事件接收

### 健康检查

```bash
# 检查后端是否运行
curl http://localhost:3000/api/health

# 检查配对状态
curl http://localhost:3000/api/pairing/status
```

## 扩展性考虑

**当前限制**：
- SQLite（单线程） - 适合小规模部署
- 内存连接池 - 服务器重启丢失连接状态
- 单实例部署 - 无集群支持

**扩展路径**：
- 切换到 PostgreSQL（支持多后端实例）
- 使用 Redis 存储连接状态
- 实现 RustPlus 连接池
- 添加速率限制和请求验证
- Docker 容器化部署

---

## 回答模版（每次必须遵守）

```
═══════════════════════════════════════════════════════════════
【问题】
[简述问题或错误信息]

【原因】
[根本原因说明]

【修改】
- 文件路径:行号 - 说明
- 文件路径:行号 - 说明

【说明】
[为什么这样修改 / 注意事项]
═══════════════════════════════════════════════════════════════
```

示例：

```
═══════════════════════════════════════════════════════════════
【问题】
TypeError: Cannot read properties of undefined (reading 'listen')

【原因】
使用了不存在的 RustPlus.FCM.listen() API

【修改】
- backend/src/services/fcm.service.js:1-7 - 导入正确模块
- backend/src/services/fcm.service.js:62-104 - 使用 PushReceiverClient
- backend/src/models/config.model.js:15-71 - 添加数据库迁移

【说明】
rustplus.js 库未暴露 FCM API，需使用 push-receiver 库。
数据库会自动迁移，nodemon 会自动重启。
═══════════════════════════════════════════════════════════════
```
