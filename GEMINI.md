# GEMINI.md

此文件为 Gemini CLI 在此代码库中工作时提供指导。

## 项目概述

**Rust+ Web Dashboard** - 多租户 SaaS Rust 游戏服务器管理面板。

| 层级 | 技术栈 |
|------|--------|
| **后端** | Node.js + Express + Prisma + MySQL + Socket.io |
| **前端** | React + Vite + Tailwind CSS + React Router |
| **支付** | 支付宝 SDK |
| **游戏** | @liamcottle/rustplus.js + FCM 推送 |

**核心功能**: 用户注册/订阅、多租户隔离、Rust+ 服务器连接、FCM 配对、游戏内命令、事件监控、智能设备控制、支付宝支付

## 开发命令

```bash
# 后端 (backend/)
npm run dev          # 开发模式
npm start            # 生产模式

# 前端 (frontend/)
npm run dev          # http://localhost:5173
npm run build        # 构建

# 同时启动
./start.sh

# 数据库
npx prisma migrate dev --name xxx   # 创建迁移
npx prisma generate                 # 生成 Client
npx prisma studio                   # 数据库 UI
```

## 核心架构

```
GlobalServiceManager (全局单例)
    │
    ├── userServices: Map<userId, UserServiceManager>
    │   │
    │   └── UserServiceManager (每用户一实例)
    │       ├── UserRustPlusManager   # 游戏服务器连接
    │       ├── UserFCMManager        # FCM 推送监听
    │       ├── UserEventMonitor      # 事件监控
    │       ├── UserAutomation        # 设备自动化
    │       └── UserCommands          # 游戏内命令
    │
    ├── WebSocketService              # 实时通信 (房间隔离)
    └── ProxyService                  # xray 代理
```

**关键特性**:
- 每用户独立服务实例，完全数据隔离
- WebSocket 房间隔离 (`user:${userId}`)
- 订阅过期自动停止服务，续费自动恢复
- 所有数据库查询自动过滤 userId

## 关键文件索引

### 后端入口
- `backend/src/app.js` - 服务器初始化入口

### 服务层 (backend/src/services/)
| 文件 | 职责 |
|------|------|
| `global-manager.service.js` | 全局服务管理器 |
| `websocket.service.js` | WebSocket + JWT认证 |
| `user-service-manager.js` | 用户服务管理器 |
| `user-rustplus-manager.js` | Rust+ 连接池 |
| `user-fcm-manager.js` | FCM 推送监听 |
| `user-event-monitor.js` | 事件监控 |
| `user-automation.js` | 设备自动化 |
| `user-commands.js` | 游戏内命令 |
| `proxy.service.js` | xray 代理 |
| `alipay.service.js` | 支付宝支付 |

### 路由层 (backend/src/routes/)
| 文件 | 路由 | 职责 |
|------|------|------|
| `auth.routes.js` | `/api/auth` | 注册/登录 |
| `user.routes.js` | `/api/user` | 用户信息 |
| `server.routes.js` | `/api/servers` | 服务器 CRUD |
| `pairing.routes.js` | `/api/pairing` | FCM 配对 |
| `payment.routes.js` | `/api/payment` | 支付订单 |
| `settings.routes.js` | `/api/settings` | 通知设置 |
| `admin.routes.js` | `/api/admin` | 管理后台 |
| `proxy.routes.js` | `/api/proxy` | 代理配置 |

### 工具层 (backend/src/utils/)
| 文件 | 职责 |
|------|------|
| `coordinates.js` | 坐标转换 (M15格式) |
| `event-constants.js` | 事件类型常量 |
| `messages.js` | 消息模板 |
| `logger.js` | 日志工具 |

### 数据库
- `backend/prisma/schema.prisma` - 数据库 Schema 定义
- `backend/prisma/seed-admin.js` - 创建默认管理员

### 前端 (frontend/src/)
| 目录/文件 | 职责 |
|-----------|------|
| `services/api.js` | REST API 客户端 |
| `services/socket.js` | WebSocket 客户端 |
| `context/AuthContext.jsx` | 认证上下文 |
| `pages/` | 页面组件 |
| `components/` | UI 组件 |

## 环境变量

### 后端 (backend/.env)
```env
DATABASE_URL="mysql://user:pass@localhost:3306/rust_dashboard"
JWT_SECRET=your-secret-key
PORT=3000
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info
ALIPAY_APP_ID=xxx
ALIPAY_PRIVATE_KEY=xxx
ALIPAY_PUBLIC_KEY=xxx
```

### 前端 (frontend/.env)
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

## 代码风格约定

### 后端
- ES6 模块 (`import`/`export`)
- 服务继承 EventEmitter，事件驱动通信
- Prisma ORM，所有查询添加 userId 过滤
- 日志用 Emoji 前缀 (✅❌🔌📨)

### 前端
- 函数式组件 + Hooks
- Tailwind CSS 工具类
- 通过 services/ 层调用 API
- 事件命名: `resource:action`

### Git 提交
- 格式: `type: 简短描述` (feat/fix/refactor/chore/docs)
- 禁止包含 AI 相关标识

## 参考项目

- **rustplusplus**: `D:\hello\code\rustplusplus`
  - 参考: 死亡检测、队伍状态、AFK 检测
  - 关键: `src/handlers/teamHandler.js`, `src/structures/Player.js`

## 详细文档

| 文档 | 内容 |
|------|------|
| `docs/ARCHITECTURE.md` | 详细架构说明、代码示例 |
| `docs/DATABASE.md` | 数据库表结构说明 |
| `docs/TROUBLESHOOTING.md` | 常见问题和解决方案 |
| `docs/FCM_GUIDE.md` | FCM 凭证管理详解 |
| `docs/ADMIN_API.md` | 管理后台 API 文档 |
| `docs/modules/` | 各服务模块详细文档 |

## 重要规则

1. **不要私自创建文档** - 除非明确要求
2. **修改前先读取文件** - 理解现有代码再修改
3. **保持简单** - 避免过度工程化
4. **多租户隔离** - 所有数据库操作必须包含 userId 过滤
5. **WebSocket 房间隔离** - 使用 `io.to(`user:${userId}`)` 而非 `io.emit()`

## 回答格式

对于代码修改任务，使用以下格式回复：

```
【问题】
简述问题或错误信息

【原因】
根本原因说明

【修改】
- 文件路径:行号 - 说明

【说明】
为什么这样修改 / 注意事项
```
