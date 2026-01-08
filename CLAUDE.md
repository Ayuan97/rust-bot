# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

**Rust+ Web Dashboard** - 一个基于 Web 的多租户 SaaS Rust 游戏服务器管理面板。

- **后端**: Node.js + Express + Prisma + MySQL + Socket.io
- **前端**: React + Vite + Tailwind CSS + React Router
- **架构**: 多租户 SaaS，支持用户注册、订阅管理、在线支付
- **核心功能**:
  - 用户系统：注册/登录、JWT认证、7天免费试用
  - 订阅管理：月付/季付/年付套餐、自动续费提醒
  - 支付集成：支付宝扫码支付、订单管理
  - 多租户隔离：每个用户独立的服务实例和数据
  - 连接 Rust+ 游戏服务器、FCM 推送监听
  - 游戏内命令系统（队伍聊天命令）
  - 事件监控（货船、直升机、油井、玩家状态）
  - 智能设备控制和自动化（日夜开关、在线触发）
  - 通知设置（可配置各类事件通知）
  - 代理支持（xray 集成）

## 参考项目

- **rustplusplus**: `D:\hello\code\rustplusplus`
  - GitHub: https://github.com/alexemanuelol/rustplusplus
  - 用途: 参考其死亡检测、队伍状态变化、AFK 检测等逻辑实现
  - 关键文件:
    - `src/handlers/teamHandler.js` - 队伍变化处理
    - `src/structures/Player.js` - 玩家状态检测（isGoneDead, isGoneAfk 等）

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
│  ┌─────────────────────────────────────────────────┐   │
│  │         认证路由 (auth.routes.js)               │   │
│  │  - 用户注册 (7天试用)                           │   │
│  │  - 用户登录 (JWT签发)                           │   │
│  │  - JWT验证中间件                                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │         支付路由 (payment.routes.js)            │   │
│  │  - 创建订单、支付宝扫码支付                      │   │
│  │  - 支付回调、订阅延长                           │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │      GlobalServiceManager (全局服务管理器)      │   │
│  │  - initializeAllActiveUsers() 启动所有用户      │   │
│  │  - createUserService(userId) 创建用户实例       │   │
│  │  - removeUserService(userId) 移除用户实例       │   │
│  │  - checkExpiredSubscriptions() 定时检查订阅     │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────┴──────────────────────────────┐   │
│  │   UserServiceManager (用户级服务实例)           │   │
│  │   每个用户一个实例，完全数据隔离                 │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ UserRustPlusManager                     │    │   │
│  │  │ - 用户专属的游戏服务器连接池             │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ UserFCMManager                          │    │   │
│  │  │ - 用户专属的FCM推送监听                  │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ UserEventMonitor                        │    │   │
│  │  │ - 用户专属的事件监控                     │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ UserAutomation                          │    │   │
│  │  │ - 用户专属的设备自动化                   │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │ UserCommands                            │    │   │
│  │  │ - 用户专属的命令处理                     │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐   │
│  │      WebSocketService (实时通信)                │   │
│  │  - JWT认证中间件                                 │   │
│  │  - 用户房间隔离 (user:${userId})                │   │
│  │  - 事件只广播给对应用户                          │   │
│  └─────────────────────────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────┴──────────────────────────────┐   │
│  │         Prisma ORM (数据访问层)                  │   │
│  │  - 自动添加 userId 过滤                          │   │
│  │  - 关系级联删除                                  │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────┴──────────────────────────────┐   │
│  │         MySQL 数据库 (多租户)                    │   │
│  │  users │ subscriptions │ servers │ devices       │   │
│  │  event_logs │ orders (所有表带userId外键)        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 关键架构模式

### 0. 服务层概览（多租户架构）

项目采用**多租户服务架构**，分为全局层和用户层两级服务：

#### 全局层服务（单例）
| 服务 | 文件 | 职责 |
|------|------|------|
| **GlobalServiceManager** | `global-manager.service.js` | 全局服务管理器，管理所有用户服务实例 |
| **WebSocketService** | `websocket.service.js` | 前端实时通信（房间隔离） |
| **ProxyService** | `proxy.service.js` | xray 代理管理（全局共享） |
| **BattlemetricsService** | `battlemetrics.service.js` | Battlemetrics API 集成 |
| **SubscriptionService** | `subscription.service.js` | 代理订阅管理 |

#### 用户层服务（每用户一实例）
| 服务 | 文件 | 职责 |
|------|------|------|
| **UserServiceManager** | `user-service-manager.js` | 用户服务管理器，管理单个用户的所有服务 |
| **UserRustPlusManager** | `user-rustplus.js` | 用户专属的游戏服务器连接池 |
| **UserFCMManager** | `user-fcm.js` | 用户专属的 FCM 推送监听 |
| **UserEventMonitor** | `user-event-monitor.js` | 用户专属的事件监控 |
| **UserAutomation** | `user-automation.js` | 用户专属的设备自动化 |
| **UserCommands** | `user-commands.js` | 用户专属的游戏内命令处理 |

**关键特性**：
- ✅ 每个用户拥有完全隔离的服务实例
- ✅ 用户订阅过期时自动停止并清理服务
- ✅ 用户续费后自动重新创建服务实例
- ✅ WebSocket 使用房间隔离（`user:${userId}`）
- ✅ 所有数据库操作自动过滤 userId

### 1. 服务层通信 (EventEmitter 发布/订阅)

所有服务都继承自 Node.js `EventEmitter`，通过事件进行解耦通信：

**示例流程：FCM 配对 → 自动连接服务器（多租户版本）**

```javascript
// 1. 用户的 FCM 服务接收配对推送
userFCMManager.handleFCMMessage()
    ↓ emit
'server:paired' 事件 (含 userId, IP、端口、Token)
    ↓
// 2. UserServiceManager 监听该事件
userServiceManager.on('server:paired', async (serverInfo) => {
    // 保存到数据库（Prisma，自动关联 userId）
    await prisma.server.create({
        data: { ...serverInfo, userId: user.id }
    });
    // 自动连接
    await userServiceManager.rustPlusService.connect(serverInfo.id);
});
    ↓
// 3. UserRustPlusManager 连接成功
userRustPlusManager.emit('server:connected', { userId, serverId })
    ↓
// 4. GlobalServiceManager 转发给 WebSocket
globalServiceManager.on('server:connected', (data) => {
    // 只广播给该用户（房间隔离）
    websocketService.emitToUser(data.userId, 'server:connected', data);
});
```

**关键变化**：
- ✅ 事件携带 `userId` 字段
- ✅ 数据库操作使用 Prisma（自动关联用户）
- ✅ WebSocket 使用房间隔离而非全局广播

### 2. 服务实例化模式

#### 全局单例（仅管理器和共享服务）

```javascript
// services/global-manager.service.js
class GlobalServiceManager extends EventEmitter { }
export default new GlobalServiceManager();  // ← 全局单例

// services/websocket.service.js
class WebSocketService { }
export default new WebSocketService();  // ← 全局单例

// services/proxy.service.js
class ProxyService { }
export default new ProxyService();  // ← 全局单例（代理是全局共享资源）
```

#### 用户级实例（每用户独立）

```javascript
// services/user-service-manager.js
class UserServiceManager extends EventEmitter {
  constructor(userId) {
    super();
    this.userId = userId;

    // 每个用户拥有独立的服务实例
    this.rustPlusService = new UserRustPlusManager(userId);
    this.fcmService = new UserFCMManager(userId);
    this.eventMonitorService = new UserEventMonitor(userId, this.rustPlusService);
    this.automationService = new UserAutomation(userId, this.rustPlusService);
    this.commandsService = new UserCommands(userId, this.rustPlusService);
  }
}

// 使用时通过 GlobalServiceManager 获取
const userService = globalServiceManager.getUserService(userId);
const rustPlusService = userService.rustPlusService;  // 用户专属实例
```

**设计原则**：
- ✅ 管理器和共享资源使用单例
- ✅ 用户业务服务使用用户级实例
- ✅ 通过 `globalServiceManager.userServices` Map 管理所有用户实例

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

**完整实现参考**: `backend/src/services/user-fcm.js`

### 2. 数据库迁移管理 (Prisma)

项目使用 **Prisma ORM** 进行数据库管理，所有 Schema 变更通过 Prisma 迁移完成：

```bash
# 创建新迁移
npx prisma migrate dev --name add_new_field

# 应用迁移到生产环境
npx prisma migrate deploy

# 生成 Prisma Client
npx prisma generate

# 查看数据库（Web UI）
npx prisma studio
```

**多租户数据隔离**：所有业务表都包含 `userId` 字段，Prisma 自动处理关联过滤：

```javascript
// prisma/schema.prisma
model Server {
  id       String   @id @default(cuid())
  userId   String   // 多租户关键字段
  name     String
  ip       String
  port     String

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  devices  Device[]
  eventLogs EventLog[]

  @@index([userId])
}

// 查询时自动过滤
const servers = await prisma.server.findMany({
  where: { userId: req.user.id }  // 只返回该用户的服务器
});

// 关联查询自动隔离
const server = await prisma.server.findUnique({
  where: { id: serverId },
  include: {
    devices: true,  // 自动只返回该服务器的设备
    eventLogs: { take: 100 }
  }
});
```

**从 SQLite 迁移到 MySQL**：
- 迁移脚本: `backend/scripts/migrate-sqlite-to-mysql.js`
- 自动创建默认管理员用户
- 保留所有历史数据并归属到默认用户

### 3. 用户级服务实例管理

每个用户拥有独立的 `UserServiceManager` 实例，包含该用户专属的所有服务：

```javascript
// user-service-manager.js
class UserServiceManager extends EventEmitter {
  constructor(userId) {
    super();
    this.userId = userId;

    // 用户专属服务实例
    this.rustPlusService = new UserRustPlusManager(userId);
    this.fcmService = new UserFCMManager(userId);
    this.eventMonitorService = new UserEventMonitor(userId, this.rustPlusService);
    this.automationService = new UserAutomation(userId, this.rustPlusService);
    this.commandsService = new UserCommands(userId, this.rustPlusService);
  }

  async initialize() {
    // 启动 FCM 监听
    await this.fcmService.start();

    // 自动连接到用户的所有服务器
    await this._connectToServers();
  }

  async shutdown() {
    // 停止所有服务
    await this.rustPlusService.disconnectAll();
    await this.fcmService.stop();
    await this.eventMonitorService.stopAll();
    await this.automationService.stopAll();
  }
}

// global-manager.service.js
class GlobalServiceManager {
  constructor() {
    this.userServices = new Map();  // userId → UserServiceManager
  }

  async createUserService(userId) {
    const manager = new UserServiceManager(userId);
    await manager.initialize();
    this.userServices.set(userId, manager);
    return manager;
  }

  getUserService(userId) {
    return this.userServices.get(userId);
  }
}
```

**注意**：
- 每个用户的服务状态完全隔离
- 用户 A 的操作不会影响用户 B
- 订阅过期时自动停止并移除该用户的服务实例
- 用户续费后自动重新创建服务实例

### 4. WebSocket 房间隔离和认证

**JWT 认证中间件**：所有 WebSocket 连接必须先通过 JWT 验证

```javascript
// websocket.service.js
io.use(async (socket, next) => {
  try {
    // 从 auth.token 或 Authorization header 获取 token
    const token = socket.handshake.auth.token ||
                  socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('未提供认证令牌'));
    }

    // 验证 JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 从数据库加载用户信息
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { subscription: true }
    });

    if (!user || !user.isActive) {
      return next(new Error('用户不存在或已禁用'));
    }

    if (user.subscription.endDate < new Date()) {
      return next(new Error('订阅已过期'));
    }

    // 将用户信息附加到 socket
    socket.userId = user.id;
    socket.username = user.username;

    // 加入用户专属房间
    socket.join(`user:${user.id}`);

    next();
  } catch (error) {
    next(new Error('认证失败'));
  }
});
```

**事件命名规范**：

**客户端 → 服务器**：
- 操作类: `resource:action` (如 `server:connect`, `device:control`)
- 请求类: `resource:info` (如 `server:info`, `team:info`)

**服务器 → 客户端（房间隔离广播）**：
```javascript
// ❌ 错误：广播给所有用户
io.emit('server:connected', { serverId });

// ✅ 正确：只广播给该用户
io.to(`user:${userId}`).emit('server:connected', { serverId });
```

- 状态类: `resource:state` (如 `server:connected`, `server:disconnected`)
- 推送类: `event:type` (如 `team:message`, `player:login`)
- 响应类: `action:result` (如 `device:control:success`, `message:send:error`)

### 5. 坐标转换系统

Rust 使用网格坐标系统（如 A5, M15），参考 [rustplusplus](https://github.com/alexemanuelol/rustplusplus) 实现。

**核心常量**:
```javascript
const GRID_DIAMETER = 146.25;  // 每个网格大小
```

**主要函数** (`backend/src/utils/coordinates.js`):

```javascript
// 将游戏坐标转换为网格位置
getGridPos(x, y, mapSize)  // 返回 "M15" 或 null

// 格式化坐标显示（网格+精确坐标）
formatPosition(x, y, mapSize)  // 返回 "M15(1823,2145)"

// 辅助函数
numberToLetters(num)           // 1→A, 27→AA
getCorrectedMapSize(mapSize)   // 修正地图大小对齐网格
getDistance(x1, y1, x2, y2)    // 计算两点距离
```

**使用示例**:
```javascript
import { formatPosition } from '../utils/coordinates.js';

const serverInfo = await rustPlusService.getServerInfo(serverId);
const position = formatPosition(player.x, player.y, serverInfo.mapSize);
// 输出: "M15(1823,2145)"
```

**网格系统说明**:
- 横轴（X）: 字母 A-Z, AA-AZ, BA-...
- 纵轴（Y）: 数字 0-29（从下往上）
- 地图大小会自动修正以对齐网格边界

**详细文档**: 参考 `docs/COORDINATES.md`

### 6. 前端服务层封装

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

### 7. 游戏内命令系统

游戏内以 `!` 开头的队伍聊天命令由 `CommandsService` 处理：

**内置命令**：
| 命令 | 说明 |
|------|------|
| `!help` | 显示可用命令 |
| `!time` | 游戏时间和天亮/天黑倒计时 |
| `!pop` | 服务器人数和30分钟变化趋势 |
| `!team` | 队伍统计（在线/离线/挂机） |
| `!online` | 在线队友列表 |
| `!afk` | 挂机队友和时长 |
| `!leader [名]` | 移交队长 |
| `!cargo` | 货船状态 |
| `!heli` | 直升机状态 |
| `!small` / `!large` | 油井状态 |
| `!events` | 活跃事件 |
| `!shop [物品]` | 搜索售货机 |
| `!tr <语言> <文本>` | 翻译 |

**设备命令**：
- 设备可配置自定义命令（如 `!灯`）
- 支持 `on`/`off`/`status` 子命令
- 支持定时操作（如 `!灯 on 5m`）

**详细文档**: `docs/COMMANDS_GUIDE.md`

### 8. 事件监控系统

`EventMonitorService` 通过轮询地图标记检测游戏事件：

**事件类型** (`utils/event-constants.js`)：
```javascript
// 地图标记类型
AppMarkerType = {
  VendingMachine: 3,     // 售货机
  CH47: 4,               // Chinook
  CargoShip: 5,          // 货船
  Crate: 6,              // 上锁箱子
  PatrolHelicopter: 8    // 武装直升机
}

// 事件时间常量
EventTiming = {
  CARGO_SHIP_EGRESS_TIME: 50 * 60 * 1000,    // 50分钟
  OIL_RIG_LOCKED_CRATE_UNLOCK_TIME: 15 * 60 * 1000,  // 15分钟
  MAP_MARKERS_POLL_INTERVAL: 5000,           // 5秒轮询
  AFK_TIME_SECONDS: 5 * 60                   // 5分钟判定AFK
}
```

**事件检测流程**：
1. 每5秒轮询地图标记
2. 比较前后两次标记差异
3. 检测新增/消失的实体
4. 触发相应事件和计时器
5. 发送游戏内通知（根据通知设置）

### 9. 设备自动化系统

`AutomationService` 支持智能设备自动控制：

**自动化模式** (`AutoMode`)：
```javascript
NONE: 0,        // 无自动化
DAY_ON: 1,      // 白天开启
NIGHT_ON: 2,    // 夜晚开启
ALWAYS_ON: 3,   // 始终开启
ALWAYS_OFF: 4,  // 始终关闭
ONLINE_ON: 7,   // 有人在线时开启
ONLINE_OFF: 8   // 有人在线时关闭
```

**设备属性**（`devices` 表新增列）：
- `command` - 自定义命令名
- `auto_mode` - 自动化模式（0-8）
- `reachable` - 设备是否可达
- `last_trigger` - 警报触发时间

### 10. 通知设置系统

`settings.routes.js` 管理游戏内通知开关：

```javascript
// 默认通知设置
DEFAULT_NOTIFICATION_SETTINGS = {
  player_death: true,      // 玩家死亡
  player_online: true,     // 上线
  player_offline: true,    // 下线
  player_afk: true,        // 挂机
  cargo_spawn: true,       // 货船刷新
  heli_spawn: true,        // 直升机刷新
  oil_rig_triggered: true, // 油井触发
  // ...
}
```

**API**：
- `GET /api/settings/notifications` - 获取设置
- `POST /api/settings/notifications` - 更新设置
- `POST /api/settings/notifications/reset` - 重置

### 11. 管理后台 API

管理后台提供完整的用户管理、订单管理和系统监控功能。所有接口需要管理员权限（`isAdmin: true`）。

**权限验证**：
```javascript
// 所有管理接口都使用双重验证
router.use(authenticate, requireAdmin);
```

**核心 API 端点**：

**用户管理**：
- `GET /api/admin/users` - 获取用户列表（分页、搜索、筛选）
  - 查询参数：`page`, `limit`, `search`, `status`, `planType`
  - 返回：用户列表 + 服务运行状态（连接的服务器、FCM监听状态）
- `GET /api/admin/users/:id` - 获取用户详情
  - 返回：用户信息 + 统计数据（服务器数、订单数、总消费）+ 服务状态
- `PUT /api/admin/users/:id/status` - 启用/禁用用户
  - 禁用时自动停止该用户的 UserServiceManager 实例
  - 启用时自动创建服务实例（如订阅有效）
- `PUT /api/admin/users/:id/subscription` - 手动调整订阅时间
  - 延长订阅后自动创建服务实例
- `DELETE /api/admin/users/:userId/servers/:serverId` - 强制断开用户服务器连接
- `GET /api/admin/users/:id/servers` - 获取用户的服务器列表（含连接状态）
- `GET /api/admin/users/:id/events` - 获取用户的事件日志（分页）

**订单管理**：
- `GET /api/admin/orders` - 获取所有订单（分页、筛选）
  - 查询参数：`page`, `limit`, `status`, `userId`

**统计数据**：
- `GET /api/admin/stats` - 获取系统统计数据
  - 用户统计：总用户、活跃用户、试用用户、付费用户、封禁用户
  - 订阅统计：即将过期用户（7天内）、已过期用户
  - 订单统计：总订单、成功订单、待支付订单、总收入、今日收入
  - Rust+业务统计：总服务器数、已连接服务器数、总设备数、活跃连接数、FCM活跃用户数
  - 事件统计：今日事件数、总事件日志数

**系统监控**：
- `GET /api/admin/system` - 获取系统运行状态
  - 运行时长、内存使用、活跃 UserServiceManager 实例数
  - GlobalServiceManager 配置信息

**集成说明**：
- 所有用户操作都会触发 `globalServiceManager` 的相应方法
- 用户详情中包含实时服务状态（从内存 Map 中获取）
- 统计数据直接查询 Prisma 数据库，确保准确性

**默认管理员账户**：
```bash
# 创建默认管理员
node backend/prisma/seed-admin.js

# 默认凭证
邮箱: admin@localhost
密码: admin123456 (可通过 ADMIN_DEFAULT_PASSWORD 环境变量自定义)
订阅: 永久订阅（至 2099-12-31）
```

### 12. 日志系统

`utils/logger.js` 提供统一日志输出：

```javascript
import logger from '../utils/logger.js';

// 基础日志
logger.info('信息');
logger.warn('警告');
logger.error('错误');
logger.debug('调试');  // 需 LOG_LEVEL=debug

// 带服务器名称的日志
logger.server(serverId, '消息');  // 输出: [10:30:45] [服务器名] 消息

// 设置服务器名称
logger.setServerName(serverId, '服务器名');
```

**日志级别** (`LOG_LEVEL` 环境变量)：
- `error` - 仅错误
- `warn` - 错误 + 警告
- `info` - 默认，常规信息
- `debug` - 包含调试信息

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

---

**问题**: FCM 已连接但收不到配对推送

**原因**: 可能的原因包括：
1. GCM 凭证未在 Rust+ 服务器注册
2. Steam ID 与游戏账号不匹配
3. 凭证已过期（检查 `expire_date` 字段）
4. 网络问题导致推送未送达

**排查步骤**:
1. 检查后端日志中是否有"FCM 连接心跳检查"（每30秒一次）
2. 确认凭证中的 `steam_id` 与游戏中的 Steam ID 一致
3. 检查凭证是否过期（`expire_date` Unix 时间戳）
4. 查看后端是否输出任何事件监听日志（ON_DATA_RECEIVED、ON_MESSAGE_RECEIVED 等）
5. 尝试在游戏中多次点击配对按钮
6. 检查防火墙是否阻止了 GCM 连接

**验证凭证有效性**:
```bash
# 访问配对状态 API
curl http://localhost:3000/api/pairing/status

# 检查返回的 credentialType 是否为 "GCM"
# 检查 isListening 是否为 true
```

**详细调试日志**: 最新版本已添加详细事件日志，包括：
- 所有可能的 FCM 事件类型监听（ON_DATA_RECEIVED、ON_MESSAGE_RECEIVED、ON_NOTIFICATION_RECEIVED）
- 连接心跳检查（每30秒）
- 消息接收时的完整数据结构输出

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

**服务层（多租户架构）**

*全局服务（单例）*：
- `backend/src/services/global-manager.service.js` - 全局服务管理器
- `backend/src/services/websocket.service.js` - WebSocket 实时通信桥（房间隔离）
- `backend/src/services/proxy.service.js` - xray 代理管理（全局共享）
- `backend/src/services/battlemetrics.service.js` - Battlemetrics API 集成
- `backend/src/services/subscription.service.js` - 代理订阅管理

*用户级服务（每用户一实例）*：
- `backend/src/services/user-service-manager.js` - 用户服务管理器
- `backend/src/services/user-rustplus.js` - 用户专属游戏服务器连接池
- `backend/src/services/user-fcm.js` - 用户专属 FCM 推送监听
- `backend/src/services/user-event-monitor.js` - 用户专属事件监控
- `backend/src/services/user-automation.js` - 用户专属设备自动化
- `backend/src/services/user-commands.js` - 用户专属游戏内命令处理

**工具层**
- `backend/src/utils/messages.js` - 消息模板系统
- `backend/src/utils/coordinates.js` - 坐标转换工具
- `backend/src/utils/event-constants.js` - 事件类型和时间常量
- `backend/src/utils/event-timer.js` - 事件计时器管理
- `backend/src/utils/logger.js` - 日志工具（支持 LOG_LEVEL）
- `backend/src/utils/timer.js` - 时间解析工具（5m, 1h30m 格式）
- `backend/src/utils/item-info.js` - 物品信息和搜索
- `backend/src/utils/monument-info.js` - 古迹信息
- `backend/src/utils/languages.js` - 语言代码映射

**数据层（Prisma + MySQL）**
- `backend/prisma/schema.prisma` - 数据库 Schema 定义
- `backend/prisma/seed-admin.js` - 创建默认管理员脚本
- `backend/scripts/migrate-sqlite-to-mysql.js` - SQLite 迁移脚本（已废弃）

**路由层**
- `backend/src/routes/auth.routes.js` - 用户注册/登录
- `backend/src/routes/user.routes.js` - 用户信息管理
- `backend/src/routes/payment.routes.js` - 支付宝支付、订单管理
- `backend/src/routes/admin.routes.js` - 管理后台 API（用户管理、订单管理、统计数据、系统监控）
- `backend/src/routes/server.routes.js` - 服务器/设备 CRUD
- `backend/src/routes/pairing.routes.js` - FCM 管理和配对
- `backend/src/routes/settings.routes.js` - 通知设置管理
- `backend/src/routes/proxy.routes.js` - 代理配置管理

### 前端核心

**入口点**
- `frontend/src/main.jsx` - React 应用入口
- `frontend/src/App.jsx` - 主应用组件

**服务层**
- `frontend/src/services/api.js` - REST API 客户端
- `frontend/src/services/socket.js` - WebSocket 客户端封装
- `frontend/src/services/pairing.js` - 配对服务 API
- `frontend/src/services/proxy.js` - 代理配置 API

**组件层**
- `frontend/src/components/ServerCard.jsx` - 服务器卡片
- `frontend/src/components/ChatPanel.jsx` - 队伍聊天
- `frontend/src/components/DeviceControl.jsx` - 设备控制
- `frontend/src/components/DeviceEditModal.jsx` - 设备编辑（命令、自动化）
- `frontend/src/components/PairingPanel.jsx` - 配对面板
- `frontend/src/components/CredentialsInput.jsx` - 凭证输入
- `frontend/src/components/SettingsPanel.jsx` - 设置面板
- `frontend/src/components/NotificationSettings.jsx` - 通知设置
- `frontend/src/components/ProxySettings.jsx` - 代理设置
- `frontend/src/components/PlayerNotifications.jsx` - 玩家状态通知

**配置**
- `frontend/vite.config.js` - Vite 配置（代理设置）
- `frontend/tailwind.config.js` - Tailwind 主题配置

## 数据库表结构 (Prisma + MySQL)

### User - 用户表
```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String   @unique
  password  String   // bcrypt 加密
  isAdmin   Boolean  @default(false)
  isActive  Boolean  @default(true)

  subscription Subscription?
  servers      Server[]
  devices      Device[]
  eventLogs    EventLog[]
  orders       Order[]

  createdAt DateTime @default(now())
  lastLogin DateTime?

  @@index([email])
}
```

### Subscription - 订阅表
```prisma
model Subscription {
  id       String   @id @default(cuid())
  userId   String   @unique
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  planType  SubscriptionPlan  // TRIAL, MONTHLY, QUARTERLY, YEARLY
  startDate DateTime
  endDate   DateTime
  status    SubscriptionStatus @default(ACTIVE)  // ACTIVE, EXPIRED, CANCELLED

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum SubscriptionPlan {
  TRIAL      // 试用版（7天）
  MONTHLY    // 月付（¥29/月）
  QUARTERLY  // 季付（¥79/季）
  YEARLY     // 年付（¥299/年）
}
```

### Order - 订单表
```prisma
model Order {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  amount    Int      // 金额（分）
  planType  SubscriptionPlan
  duration  Int      // 时长（天）

  paymentMethod PaymentMethod  // ALIPAY, WECHAT
  status        OrderStatus @default(PENDING)  // PENDING, SUCCESS, FAILED, CANCELLED

  tradeNo       String?  // 支付宝/微信交易号
  paidAt        DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
}
```

### Server - 游戏服务器配置（多租户）
```prisma
model Server {
  id       String   @id @default(cuid())
  userId   String   // 多租户关键字段
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  name     String
  ip       String
  port     String
  playerId String
  playerToken String

  battlemetricsId String?
  img             String?
  logo            String?
  url             String?
  description     String?

  devices   Device[]
  eventLogs EventLog[]

  createdAt DateTime @default(now())

  @@index([userId])
}
```

### Device - 智能设备配置（多租户）
```prisma
model Device {
  id       String  @id @default(cuid())
  serverId String
  server   Server  @relation(fields: [serverId], references: [id], onDelete: Cascade)

  userId   String  // 冗余字段，便于直接查询
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  entityId    Int
  name        String
  type        DeviceType?  // SWITCH, ALARM, STORAGE_MONITOR
  command     String?      // 自定义命令名
  autoMode    Int @default(0)  // 自动化模式（0-8）
  reachable   Boolean @default(true)
  lastTrigger DateTime?

  createdAt DateTime @default(now())

  @@unique([serverId, entityId])
  @@index([userId])
}
```

### EventLog - 事件日志（多租户）
```prisma
model EventLog {
  id       String   @id @default(cuid())
  serverId String
  server   Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)

  userId   String   // 冗余字段
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  eventType String
  eventData Json?

  createdAt DateTime @default(now())

  @@index([userId])
  @@index([serverId])
  @@index([createdAt])
}
```

**多租户隔离特性**：
- 所有业务表都包含 `userId` 外键
- 级联删除：删除用户时自动清理所有关联数据
- 索引优化：userId、serverId、createdAt 都建立了索引
- Prisma 自动处理关联查询的用户过滤

## 环境变量

### 后端 (`backend/.env`)
```env
# 数据库
DATABASE_URL="mysql://user:password@localhost:3306/rust_dashboard"

# JWT认证
JWT_SECRET=your-secret-key-here          # JWT签名密钥（必须修改）
JWT_EXPIRES_IN=7d                        # Token过期时间

# 服务器配置
PORT=3000                                # HTTP 服务器端口
FRONTEND_URL=http://localhost:5173       # 前端 URL（CORS）
LOG_LEVEL=info                          # 日志级别: error/warn/info/debug

# 支付宝配置
ALIPAY_APP_ID=your_app_id
ALIPAY_PRIVATE_KEY=your_private_key
ALIPAY_PUBLIC_KEY=alipay_public_key
ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do  # 沙箱环境
ALIPAY_NOTIFY_URL=https://your-domain.com/api/payment/callback/alipay
ALIPAY_RETURN_URL=https://your-domain.com/payment/success

# 代理配置（可选）
PROXY_SUBSCRIPTION_URL=                  # 代理订阅链接
PROXY_NODE_NAME=                         # 首选节点名称
PROXY_PORT=10808                         # 本地代理端口

# 管理员账户（首次部署）
ADMIN_DEFAULT_PASSWORD=admin123456       # 默认管理员密码
```

### 前端 (`frontend/.env`)
```env
VITE_API_URL=http://localhost:3000/api      # 后端 API 地址
VITE_SOCKET_URL=http://localhost:3000       # WebSocket 地址
```

## 服务器初始化流程

后端启动顺序（`backend/src/app.js`）- **多租户架构**：

1. 加载 `.env` 环境变量
2. 初始化 Prisma Client 连接 MySQL
3. 初始化 Express + HTTP 服务器
4. 配置 CORS（允许前端跨域）
5. 挂载路由：
   - `/api/auth` - 用户注册/登录
   - `/api/user` - 用户信息管理
   - `/api/payment` - 支付宝支付、订单管理
   - `/api/admin` - 管理后台 API（需 isAdmin=true）
   - `/api/settings` - 通知设置管理
   - `/api/health` - 健康检查
6. 初始化 **GlobalServiceManager**
7. 初始化 **WebSocketService** （Socket.io + JWT认证中间件）
8. 调用 `globalServiceManager.initializeAllActiveUsers()`：
   - 查询所有 `isActive=true` 且订阅未过期的用户
   - 为每个用户创建 UserServiceManager 实例
   - 每个实例包含：UserRustPlusManager, UserFCMManager, UserEventMonitor, UserAutomation, UserCommands
9. 启动订阅检查定时任务（每小时检查一次）：
   - 检查订阅过期用户并自动停止服务
   - 检查即将过期用户（3天内）并发出提醒
10. 设置优雅关闭处理器（SIGTERM/SIGINT）：
    - 调用 `globalServiceManager.shutdownAll()`
    - 停止所有用户服务实例
    - 关闭 Prisma 数据库连接
11. 监听端口 3000

## 代码风格约定

### 后端

- **模块系统**: ES6 模块 (`import`/`export`)
- **服务模式**:
  - **全局层**: 单例 + EventEmitter（GlobalServiceManager、WebSocketService）
  - **用户层**: 每用户一个实例（UserServiceManager 及其子服务）
- **数据库**: Prisma ORM，所有查询自动添加 userId 过滤
- **日志格式**: Emoji 前缀（✅ 成功、❌ 错误、🔌 连接、📨 消息）
- **错误处理**: 路由层 try/catch，服务层 emit error 事件
- **认证**: JWT Token，7天过期，所有 API 和 WebSocket 都需验证

### 前端

- **组件**: 函数式组件 + Hooks
- **状态管理**: useState, useEffect（未使用 Redux/Zustand）
- **样式**: Tailwind CSS 工具类 + 少量自定义 CSS
- **API 调用**: 通过 `services/` 层封装，不在组件直接调用
- **事件命名**: 小写加冒号分隔（如 `server:connect`）

### Git 提交规范

- **禁止 AI 标识**: 提交信息中不得包含任何 AI 相关标识（如 "Generated with Claude"、"Co-Authored-By: Claude" 等）
- **提交信息格式**: `type: 简短描述`，type 包括 feat/fix/refactor/chore/docs

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
- `docs/COORDINATES.md` - 坐标转换系统详解
- `docs/COMMANDS_GUIDE.md` - 游戏内命令系统完整指南
- `docs/PROXY_SETUP.md` - 代理配置说明
- `start.sh` - 启动脚本（同时启动前后端）

## 调试技巧

### 后端日志

后端使用统一的日志系统（`utils/logger.js`），支持时间戳和服务器名称：
```
[10:30:45] ✅ FCM 注册成功
[10:30:46] [MyServer] 🔌 已连接到服务器
[10:30:47] [MyServer] 💬 [PlayerName]: Hello team!
[10:30:48] 🚨 智能警报: Motion detected
[10:30:49] ❌ 连接失败: Connection timeout
```

**启用调试日志**：
```bash
LOG_LEVEL=debug npm run dev
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

**已实现**：
- ✅ 多租户 SaaS 架构
- ✅ MySQL 数据库（支持高并发）
- ✅ 用户级服务隔离
- ✅ 订阅管理和自动续费提醒
- ✅ 支付集成（支付宝）
- ✅ 管理后台（用户/订单/统计）
- ✅ 自动重连到已保存的服务器
- ✅ 代理支持（xray 集成）
- ✅ 游戏内命令系统
- ✅ 设备自动化控制
- ✅ 事件监控和通知
- ✅ Docker 容器化部署

**当前限制**：
- ⚠️ 内存事件状态 - 服务器重启丢失活跃事件
- ⚠️ 单实例部署 - 无集群支持
- ⚠️ 微信支付未实现

**扩展路径**：
- 使用 Redis 存储事件状态和会话
- 添加速率限制和请求验证
- 实现负载均衡和多实例部署
- Web 推送通知（浏览器通知）
- 实现微信支付集成
- 添加监控和日志系统（Sentry, Winston）

---
没有要求不能私自创建文档-必须遵守

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
