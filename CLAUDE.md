# CLAUDE.md
永远使用中文回答
为 Claude Code 提供项目指导。

## 项目概述

**Rust+ Web Dashboard** - 多租户 SaaS Rust 游戏服务器管理面板

**技术栈**: Node.js/Express/MySQL/Socket.io | React/Vite/Tailwind | @liamcottle/rustplus.js

## 核心架构

```
GlobalServiceManager (全局单例)
├── userServices: Map<userId, UserServiceManager>
│   └── UserServiceManager (每用户一实例)
│       ├── UserRustPlusManager   # Rust+ 连接
│       ├── UserFCMManager        # FCM 推送
│       ├── UserEventMonitor      # 事件监控
│       ├── UserAutomation        # 设备自动化
│       └── UserCommands          # 游戏内命令
├── WebSocketService              # 实时通信
└── ProxyService                  # xray 代理
```

**多租户隔离**:
- 每用户独立服务实例
- WebSocket 房间隔离 (`user:${userId}`)
- 所有数据库查询必须过滤 userId
- 订阅过期自动停止服务

## 目录结构

```
backend/
├── src/app.js                    # 入口
├── src/lib/db.js                 # 数据库连接池 (mysql2)
├── src/services/                 # 服务层 (global-manager, user-*, websocket, proxy, alipay)
├── src/routes/                   # API 路由 (/api/auth, /api/servers, /api/pairing...)
├── src/utils/                    # 工具 (coordinates, event-constants, messages, logger)
└── sql/init.sql                  # 数据库初始化脚本

frontend/src/
├── services/                     # API/Socket 客户端
├── context/                      # React Context
├── pages/                        # 页面组件
└── components/                   # UI 组件
```

## 开发规范

**后端**:
- ES6 模块语法
- 服务继承 EventEmitter，事件驱动
- 数据库查询使用 mysql2，必须添加 userId 过滤
- 日志不使用 Emoji

**数据库变更** (严格遵守):
- 使用 `backend/sql/init.sql` 定义表结构
- 变更通过 SQL 脚本执行 (`backend/sql/migrations/`)
- 禁止使用 ORM 迁移工具

**前端**:
- 函数式组件 + Hooks
- Tailwind CSS
- 通过 services/ 调用 API

**Git 提交**:
- 禁止 AI 标识 (Co-Authored-By 等)
- 格式: `type: 描述` (feat/fix/refactor/chore/docs)
- 禁止私自创建文档

## 参考

- 参考项目: `D:\hello\code\rustplusplus`
- 详细文档: `docs/` 目录

**注意事项**:
- 不要使用 Emoji 前缀 (✅❌🔌📨)
- 不要使用 AI 标识 (Co-Authored-By 等)
- 不要私自创建文档
