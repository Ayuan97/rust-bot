# 架构详解

本文档详细说明项目的多租户架构设计和核心实现模式。

## 整体架构图

```
┌────────────────────────────────────────────────────────────┐
│                     浏览器客户端                            │
│            (React Router + JWT认证)                        │
└────────────────────────────────────────────────────────────┘
                │                     │
         REST API (Axios)      WebSocket (Socket.io)
         (带JWT Token)          (房间隔离)
                │                     │
┌───────────────┴─────────────────────┴───────────────────┐
│              后端服务 (Express, localhost:3000)          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │      GlobalServiceManager (全局服务管理器)          │ │
│  │  - initializeAllActiveUsers() 启动所有用户          │ │
│  │  - createUserService(userId) 创建用户实例           │ │
│  │  - removeUserService(userId) 移除用户实例           │ │
│  │  - checkExpiredSubscriptions() 定时检查订阅         │ │
│  └──────────────────┬─────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────┴─────────────────────────────────┐ │
│  │   UserServiceManager (用户级服务实例)               │ │
│  │   每个用户一个实例，完全数据隔离                     │ │
│  │                                                     │ │
│  │  ├── UserRustPlusManager  (游戏服务器连接池)        │ │
│  │  ├── UserFCMManager       (FCM推送监听)             │ │
│  │  ├── UserEventMonitor     (事件监控)                │ │
│  │  ├── UserAutomation       (设备自动化)              │ │
│  │  └── UserCommands         (命令处理)                │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │      WebSocketService (实时通信)                     │ │
│  │  - JWT认证中间件                                     │ │
│  │  - 用户房间隔离 (user:${userId})                    │ │
│  └─────────────────────────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────┴─────────────────────────────────┐ │
│  │         mysql2 连接池 → MySQL 数据库                   │ │
│  │  users │ subscriptions │ servers │ devices          │ │
│  │  event_logs │ orders (所有表带userId外键)           │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## 服务层级

### 全局层服务（单例）

| 服务 | 文件 | 职责 |
|------|------|------|
| **GlobalServiceManager** | `global-manager.service.js` | 全局服务管理器，管理所有用户服务实例 |
| **WebSocketService** | `websocket.service.js` | 前端实时通信（房间隔离） |
| **ProxyService** | `proxy.service.js` | xray 代理管理（全局共享） |
| **BattlemetricsService** | `battlemetrics.service.js` | Battlemetrics API 集成 |

### 用户层服务（每用户一实例）

| 服务 | 文件 | 职责 |
|------|------|------|
| **UserServiceManager** | `user-service-manager.js` | 用户服务管理器 |
| **UserRustPlusManager** | `user-rustplus-manager.js` | 游戏服务器连接池 |
| **UserFCMManager** | `user-fcm-manager.js` | FCM 推送监听 |
| **UserEventMonitor** | `user-event-monitor.js` | 事件监控 |
| **UserAutomation** | `user-automation.js` | 设备自动化 |
| **UserCommands** | `user-commands.js` | 游戏内命令处理 |

## EventEmitter 通信模式

所有服务都继承自 Node.js `EventEmitter`，通过事件进行解耦通信。

### 示例：FCM 配对 → 自动连接服务器

```javascript
// 1. FCM 服务接收配对推送
userFCMManager.handleFCMMessage()
    ↓ emit
'server:paired' 事件 (含 userId, IP、端口、Token)
    ↓
// 2. UserServiceManager 监听
userServiceManager.on('server:paired', async (serverInfo) => {
    await db.query('INSERT INTO servers ...', [...]);
    await userServiceManager.rustPlusService.connect(serverInfo.id);
});
    ↓
// 3. RustPlusManager 连接成功
userRustPlusManager.emit('server:connected', { userId, serverId })
    ↓
// 4. 转发给 WebSocket (房间隔离)
websocketService.emitToUser(data.userId, 'server:connected', data);
```

## 服务实例化模式

### 全局单例

```javascript
// services/global-manager.service.js
class GlobalServiceManager extends EventEmitter { }
export default new GlobalServiceManager();  // 全局单例

// services/websocket.service.js
class WebSocketService { }
export default new WebSocketService();  // 全局单例
```

### 用户级实例

```javascript
// services/user-service-manager.js
class UserServiceManager extends EventEmitter {
  constructor(userId) {
    super();
    this.userId = userId;
    this.rustPlusService = new UserRustPlusManager(userId);
    this.fcmService = new UserFCMManager(userId);
    this.eventMonitorService = new UserEventMonitor(userId, this.rustPlusService);
    this.automationService = new UserAutomation(userId, this.rustPlusService);
    this.commandsService = new UserCommands(userId, this.rustPlusService);
  }
}

// 获取用户服务
const userService = globalServiceManager.getUserService(userId);
```

## 前后端通信

### REST API (Axios)
- CRUD 操作
- 配置管理
- 带 JWT Token

### WebSocket (Socket.io)
- 实时事件推送
- 命令执行
- 房间隔离

```javascript
// 前端示例
await api.addServer(serverInfo);              // REST
socket.emit('server:connect', { serverId });  // WebSocket
socket.on('team:message', (msg) => { });      // 监听
```

## WebSocket 房间隔离

### JWT 认证中间件

```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
  const user = rows[0];

  socket.userId = user.id;
  socket.join(`user:${user.id}`);  // 加入用户专属房间
  next();
});
```

### 事件广播

```javascript
// ❌ 错误：广播给所有用户
io.emit('server:connected', { serverId });

// ✅ 正确：只广播给该用户
io.to(`user:${userId}`).emit('server:connected', { serverId });
```

## 事件命名规范

**客户端 → 服务器**：
- 操作类: `resource:action` (`server:connect`, `device:control`)
- 请求类: `resource:info` (`server:info`, `team:info`)

**服务器 → 客户端**：
- 状态类: `resource:state` (`server:connected`, `server:disconnected`)
- 推送类: `event:type` (`team:message`, `player:login`)
- 响应类: `action:result` (`device:control:success`)

## 服务器启动流程

1. 加载 `.env` 环境变量
2. 初始化 mysql2 连接池
3. 初始化 Express + HTTP 服务器
4. 配置 CORS
5. 挂载路由
6. 初始化 GlobalServiceManager
7. 初始化 WebSocketService
8. `globalServiceManager.initializeAllActiveUsers()`
   - 查询所有 active 且订阅未过期的用户
   - 为每个用户创建 UserServiceManager 实例
9. 启动订阅检查定时任务（每小时）
10. 设置优雅关闭处理器
11. 监听端口 3000

## 坐标转换系统

Rust 使用网格坐标系统（如 A5, M15）。

```javascript
// backend/src/utils/coordinates.js
const GRID_DIAMETER = 146.25;  // 每个网格大小

getGridPos(x, y, mapSize)       // 返回 "M15"
formatPosition(x, y, mapSize)   // 返回 "M15(1823,2145)"
numberToLetters(num)            // 1→A, 27→AA
getDistance(x1, y1, x2, y2)     // 计算距离
```

## 游戏内命令系统

以 `!` 开头的队伍聊天命令由 `UserCommands` 处理。

**内置命令**：
| 命令 | 说明 |
|------|------|
| `!help` | 显示可用命令 |
| `!time` | 游戏时间 |
| `!pop` | 服务器人数 |
| `!team` | 队伍统计 |
| `!cargo` | 货船状态 |
| `!heli` | 直升机状态 |
| `!events` | 活跃事件 |

**设备命令**：
- 可配置自定义命令（如 `!灯`）
- 支持 `on`/`off`/`status` 子命令
- 支持定时操作（如 `!灯 on 5m`）

## 事件监控系统

`UserEventMonitor` 通过轮询地图标记检测游戏事件。

**事件类型**：
```javascript
AppMarkerType = {
  VendingMachine: 3,
  CH47: 4,
  CargoShip: 5,
  Crate: 6,
  PatrolHelicopter: 8
}
```

**检测流程**：
1. 每5秒轮询地图标记
2. 比较前后两次标记差异
3. 检测新增/消失的实体
4. 触发事件和计时器
5. 发送通知

## 设备自动化

**自动化模式**：
```javascript
AutoMode = {
  NONE: 0,        // 无
  DAY_ON: 1,      // 白天开
  NIGHT_ON: 2,    // 夜晚开
  ALWAYS_ON: 3,   // 始终开
  ALWAYS_OFF: 4,  // 始终关
  ONLINE_ON: 7,   // 有人在线开
  ONLINE_OFF: 8   // 有人在线关
}
```
