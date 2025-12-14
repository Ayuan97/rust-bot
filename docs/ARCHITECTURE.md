# 🏗️ 架构设计文档

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Browser                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              React Frontend (Port 5173)              │   │
│  │  • 服务器列表  • 聊天面板  • 设备控制  • 配对界面  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │ │
                    HTTP   │ │ WebSocket
                    (API)  │ │ (实时通信)
                           ↓ ↓
┌─────────────────────────────────────────────────────────────┐
│              Node.js Backend (Port 3000)                    │
│  ┌─────────────────┬──────────────────┬──────────────────┐  │
│  │  Express API    │  Socket.io       │  FCM Listener    │  │
│  │  REST 接口      │  实时推送        │  配对监听        │  │
│  └─────────────────┴──────────────────┴──────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              RustPlus Service                        │  │
│  │  管理多个 Rust+ WebSocket 连接                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              SQLite Database                         │  │
│  │  服务器配置 | 设备列表 | FCM 凭证                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                    FCM    │    Rust+ Protocol
                 (配对推送) │    (WebSocket)
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Rust Game Server                         │
│  • 队伍聊天  • 智能设备  • 服务器信息  • 事件推送          │
└─────────────────────────────────────────────────────────────┘
```

## 核心流程

### 1. 配对流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Frontend │         │ Backend  │         │   FCM    │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                     │
     │  启动配对          │                     │
     ├───────────────────>│                     │
     │                    │  注册/加载 FCM      │
     │                    ├────────────────────>│
     │                    │                     │
     │                    │  开始监听推送       │
     │                    │<────────────────────┤
     │                    │                     │
     │  等待配对...       │                     │
     │<───────────────────┤                     │
     │                    │                     │

游戏内配对 ────────────────────────────────────>│
     │                    │                     │
     │                    │  收到配对推送       │
     │                    │<────────────────────┤
     │                    │                     │
     │                    │  解析服务器信息     │
     │                    │  保存到数据库       │
     │                    │  自动连接 Rust+     │
     │                    │                     │
     │  配对成功通知      │                     │
     │<───────────────────┤                     │
     │                    │                     │
```

### 2. 消息发送流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Frontend │         │ Backend  │         │   Rust   │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                     │
     │  发送消息          │                     │
     ├───────────────────>│                     │
     │  (WebSocket)       │                     │
     │                    │  调用 sendTeamMsg   │
     │                    ├────────────────────>│
     │                    │  (Rust+ WebSocket)  │
     │                    │                     │
     │  发送成功          │  ACK                │
     │<───────────────────┤<────────────────────┤
     │                    │                     │
     │                    │  队伍消息推送       │
     │  实时显示消息      │<────────────────────┤
     │<───────────────────┤                     │
     │                    │                     │
```

### 3. 设备控制流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Frontend │         │ Backend  │         │   Rust   │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                     │
     │  控制设备 (开/关)  │                     │
     ├───────────────────>│                     │
     │                    │  setEntityValue     │
     │                    ├────────────────────>│
     │                    │                     │
     │  控制成功          │  ACK                │
     │<───────────────────┤<────────────────────┤
     │                    │                     │
     │                    │  设备状态变化推送   │
     │  更新 UI 状态      │<────────────────────┤
     │<───────────────────┤                     │
     │                    │                     │
```

## 技术选型

### 后端

| 技术 | 用途 | 选择理由 |
|------|------|----------|
| Node.js | 运行环境 | 异步 I/O，适合实时应用 |
| Express | Web 框架 | 轻量、灵活、生态丰富 |
| Socket.io | 实时通信 | 自动降级、断线重连 |
| rustplus.js | Rust+ API | 官方推荐库 |
| SQLite | 数据存储 | 轻量、无需配置、易部署 |

### 前端

| 技术 | 用途 | 选择理由 |
|------|------|----------|
| React | UI 框架 | 组件化、生态丰富 |
| Vite | 构建工具 | 快速、现代化 |
| TailwindCSS | 样式框架 | 快速开发、一致性 |
| Socket.io-client | 实时通信 | 与后端配套 |
| Axios | HTTP 客户端 | 简洁、易用 |

## 数据模型

### 服务器表 (servers)

```sql
CREATE TABLE servers (
  id TEXT PRIMARY KEY,              -- 服务器唯一 ID
  name TEXT NOT NULL,               -- 服务器名称
  ip TEXT NOT NULL,                 -- IP 地址
  port TEXT NOT NULL,               -- 端口
  player_id TEXT NOT NULL,          -- 玩家 Steam ID
  player_token TEXT NOT NULL,       -- 配对令牌
  created_at INTEGER                -- 创建时间
)
```

### 设备表 (devices)

```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY,           -- 自增 ID
  server_id TEXT NOT NULL,          -- 所属服务器
  entity_id INTEGER NOT NULL,       -- 游戏内实体 ID
  name TEXT NOT NULL,               -- 设备名称
  type TEXT,                        -- 设备类型
  created_at INTEGER,               -- 创建时间
  UNIQUE(server_id, entity_id)      -- 组合唯一键
)
```

### FCM 凭证表 (fcm_credentials)

```sql
CREATE TABLE fcm_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- 强制单例
  credentials_json TEXT NOT NULL,         -- 完整 GCM 凭证 JSON
  credential_type TEXT NOT NULL,          -- "GCM"
  created_at INTEGER,                     -- 创建时间
  updated_at INTEGER                      -- 更新时间
)
```

**凭证格式 (credentials_json)**:
```json
{
  "gcm": {
    "androidId": "...",
    "securityToken": "..."
  },
  "steam": {
    "steamId": "76561198..."
  }
}
```

## 核心服务

### 1. FCMService (fcm.service.js)

**职责：**
- 注册 FCM 推送服务
- 监听配对推送
- 解析推送消息
- 发出配对事件

**关键方法：**
- `registerAndListen()` - 注册并开始监听
- `startListening()` - 使用已有凭证监听
- `handleFCMMessage()` - 处理推送消息

### 2. RustPlusService (rustplus.service.js)

**职责：**
- 管理多个 Rust+ 连接
- 发送命令到游戏服务器
- 接收游戏事件推送
- 转发事件给 WebSocket

**关键方法：**
- `connect()` - 连接到服务器
- `disconnect()` - 断开连接
- `sendTeamMessage()` - 发送队伍消息
- `setEntityValue()` - 控制设备
- `getServerInfo()` - 获取服务器信息

### 3. WebSocketService (websocket.service.js)

**职责：**
- 管理 Socket.io 连接
- 处理客户端请求
- 推送实时事件
- 广播消息

**关键事件：**
- `server:connect` - 连接到 Rust+ 服务器
- `message:send` - 发送消息
- `device:control` - 控制设备
- `server:paired` - 服务器配对成功 (推送)

## 安全考虑

### 1. 数据安全

- **FCM 凭证** - 存储在本地数据库，不传输到前端
- **Player Token** - 加密存储（待实现）
- **数据库** - 本地文件，不暴露给外部

### 2. 网络安全

- **CORS** - 限制前端访问来源
- **WebSocket** - 限制连接来源
- **输入验证** - 所有 API 参数验证

### 3. 待改进

- [ ] 添加用户认证
- [ ] Token 加密存储
- [ ] API 限流
- [ ] HTTPS 支持

## 性能优化

### 1. 前端

- 虚拟滚动（大量消息/设备时）
- 组件懒加载
- 状态管理优化
- WebSocket 连接池

### 2. 后端

- 连接池管理
- 事件去重
- 数据库索引
- 内存缓存

## 扩展性

### 横向扩展

- 多进程支持
- 负载均衡
- 分布式会话

### 功能扩展

- 插件系统
- 自定义命令
- 自动化脚本
- 数据分析

## 监控和日志

### 日志级别

- `console.log` - 普通信息
- `console.error` - 错误信息
- `console.warn` - 警告信息

### 待添加

- [ ] 日志文件持久化
- [ ] 性能监控
- [ ] 错误追踪
- [ ] 使用统计

## 部署建议

### 开发环境

```bash
# 使用启动脚本
./start.sh
```

### 生产环境

```bash
# 构建前端
cd frontend && npm run build

# 配置静态文件服务
# 使用 PM2 管理后端进程
pm2 start backend/src/app.js --name rust-plus-backend
```

### Docker 部署

```bash
# 一键启动
./docker-start.sh

# 或使用 Docker Compose
docker-compose up -d

# 查看日志
docker-compose logs -f
```

详细说明请参考 [DOCKER.md](../DOCKER.md)

## 故障排查

### 常见问题

1. **FCM 连接失败**
   - 检查网络连接
   - 查看 FCM 凭证是否有效
   - 重置凭证重试

2. **Rust+ 连接失败**
   - 确认服务器信息正确
   - 检查游戏是否运行
   - 查看后端日志

3. **WebSocket 断开**
   - 检查网络稳定性
   - 查看浏览器控制台
   - 重启服务

### 调试技巧

```javascript
// 启用详细日志
process.env.DEBUG = 'rustplus:*'

// 查看 WebSocket 连接
socketService.io.sockets.sockets

// 查看所有连接的服务器
rustPlusService.getConnectedServers()
```

## 贡献指南

### 代码规范

- ESLint 配置
- Prettier 格式化
- 命名规范
- 注释规范

### 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 许可证

MIT License - 详见 LICENSE 文件
