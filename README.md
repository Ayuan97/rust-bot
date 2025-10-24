# Rust+ Web Dashboard

一个基于 Web 的 Rust+ 游戏助手，支持服务器配对、设备控制、地图查看等功能。

## ✨ 特性

- 🎮 **服务器配对** - 通过 FCM 推送自动配对游戏服务器
- 🔌 **设备控制** - 控制游戏内智能设备（门、灯、开关等）
- 🗺️ **地图查看** - 实时查看服务器地图和标记点
- 📊 **服务器信息** - 查看服务器状态、玩家列表等
- 🔔 **推送通知** - 接收游戏内警报和事件通知
- 💬 **队伍聊天** - 从网页发送消息到游戏队伍聊天
- 🤖 **游戏内命令** - 通过聊天发送 `!` 开头命令与机器人互动
- 🎯 **事件监听** - 自动检测玩家死亡、重生、上线、下线等事件

## 🚀 快速开始

### 部署方式

本项目支持两种部署方式：

1. **🐳 Docker 部署（推荐）** - 一键启动，无需配置环境
2. **📦 本地部署** - 手动安装依赖和运行

---

### 方式一：Docker 部署（推荐）

#### 前置要求

- Docker (>= 20.10)
- Docker Compose (>= 2.0)

#### 快速启动

```bash
# 一键启动（使用脚本）
./docker-start.sh

# 或手动启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

访问:
- **前端**: http://localhost:3002
- **后端**: http://localhost:3001/api

**特点：**
- ✅ 一键启动，环境隔离
- ✅ 每次启动都是全新环境
- ⚠️ 容器删除后数据清空

**详细文档**: 查看 [Docker 部署指南](DOCKER.md)

---

### 方式二：本地部署

#### 前置要求

- Node.js >= 16
- npm 或 yarn
- Rust 游戏和 Steam 账号

#### 安装

1. **克隆项目**
   ```bash
   cd /Users/administer/Desktop/go/rust-bot-new
   ```

2. **安装后端依赖**
   ```bash
   cd backend
   npm install
   ```

3. **安装前端依赖**
   ```bash
   cd frontend
   npm install
   ```

### 启动

1. **启动后端**
   ```bash
   cd backend
   npm start
   ```
   后端将运行在 `http://localhost:3000`

2. **启动前端**
   ```bash
   cd frontend
   npm run dev
   ```
   前端将运行在 `http://localhost:5173`

3. **访问应用**

   打开浏览器访问 `http://localhost:5173`

### FCM 注册（首次使用）

1. 点击"自动注册（推荐）"
2. 点击"开始注册"，会在新标签页打开 Steam 登录页面
3. 使用 Steam 账号登录
4. 登录成功后，页面会显示凭证命令，类似：
   ```
   /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ...
   ```
5. 复制完整命令
6. 切回 Dashboard 标签页，粘贴到输入框
7. 点击"完成注册"
8. 等待 FCM 连接建立

### 服务器配对

1. 确保 FCM 注册完成并连接成功
2. 进入 Rust 游戏并加入服务器
3. 按 ESC 打开菜单
4. 点击右下角 Rust+ 图标
5. 点击 "Pair with Server"
6. 网页会自动显示配对成功通知
7. 服务器出现在列表中，可以开始使用

### 🤖 使用游戏内命令

连接服务器后，可以在游戏内通过队伍聊天与机器人互动：

```
!help           # 查看所有可用命令
!time           # 查看当前游戏时间
!online         # 查看在线队友
!pos            # 查看队友位置
!info           # 查看服务器信息
!markers        # 查看地图标记
!notify         # 控制自动通知（死亡/重生）
!ping           # 测试机器人响应
```

**示例：**
1. 在游戏中按 `Enter` 打开队伍聊天
2. 输入 `!time` 并发送
3. 机器人会自动回复当前游戏时间

**🔔 自动通知功能：**
- 机器人会自动检测队友死亡和重生事件
- 默认会在队伍聊天发送通知消息
- 使用 `!notify death off` 关闭死亡通知
- 使用 `!notify spawn off` 关闭重生通知

详见 [游戏内命令指南](docs/COMMANDS_GUIDE.md)

## 📖 详细文档

- 🐳 **[Docker 部署指南](DOCKER.md)** - Docker 容器化部署完整教程
- 📘 **[快速测试指南](QUICK_TEST_GUIDE.md)** - 测试和故障排查
- 🎮 **[游戏内命令指南](docs/COMMANDS_GUIDE.md)** - 机器人命令系统使用说明
- 🎯 **[事件系统指南](docs/EVENTS_GUIDE.md)** - 所有可用事件类型和监听方法
- 📗 **[FCM 简化流程](backend/FCM_SIMPLIFIED_FLOW.md)** - FCM 注册原理详解
- 📕 **[实现总结](IMPLEMENTATION_SUMMARY.md)** - 完整实现说明
- 📙 **[版本日志](CHANGELOG_FCM_V2.md)** - V2.0 更新内容
- 📔 **[架构文档](docs/ARCHITECTURE.md)** - 系统架构设计
- 📓 **[API 文档](docs/API_CHANNELS.md)** - API 接口说明

## 🏗️ 项目结构

```
rust-bot-new/
├── backend/              # 后端服务
│   ├── src/
│   │   ├── routes/      # API 路由
│   │   ├── services/    # 业务逻辑
│   │   ├── models/      # 数据模型
│   │   └── index.js     # 入口文件
│   └── package.json
│
├── frontend/             # 前端应用
│   ├── src/
│   │   ├── components/  # React 组件
│   │   ├── services/    # API 服务
│   │   └── App.jsx      # 主应用
│   └── package.json
│
└── docs/                 # 详细文档
    ├── ARCHITECTURE.md   # 架构说明
    ├── API_CHANNELS.md   # API 和通道文档
    └── SETUP_GUIDE.md    # 详细设置指南
```

## 🔧 核心技术

### 后端
- **Node.js + Express** - Web 服务器
- **Socket.io** - WebSocket 实时通信
- **@liamcottle/rustplus.js** - Rust+ API 封装
- **@liamcottle/push-receiver** - FCM 推送接收
- **better-sqlite3** - 数据持久化

### 前端
- **React + Vite** - UI 框架
- **Socket.io-client** - WebSocket 客户端
- **Axios** - HTTP 客户端
- **React Icons** - 图标库
- **Tailwind CSS** - 样式框架

## 💡 FCM 注册原理

本项目使用**直连 MCS 复用已注册设备**的方式：

1. 用户登录 Companion 获取已注册设备的凭证
2. 我们使用这些凭证直接连接 FCM (mtalk.google.com:5228)
3. Companion 后端已经认识这个设备，可以正常路由推送
4. **不需要 auth_token**（因为不是注册新设备）

详细说明见 `backend/FCM_SIMPLIFIED_FLOW.md`

## ❓ 常见问题

### Q: 收不到推送消息怎么办？

**检查步骤：**
1. 后端日志是否显示"FCM 连接已建立"
2. 是否有心跳日志（每 30 秒一次）
3. 凭证是否过期（检查 expire_date）
4. 尝试重新获取凭证并注册

### Q: 凭证过期了怎么办？

重新登录 `https://companion-rust.facepunch.com/login` 获取新凭证即可。
凭证通常有效期约 2 周。

### Q: 为什么不需要 auth_token？

因为我们使用的是 Companion 的已注册设备凭证，不是注册新设备。
设备已经绑定到用户的 Steam 账号，所以不需要再次证明身份。

详见：`backend/FCM_SIMPLIFIED_FLOW.md`

### Q: 能同时监听多个账号吗？

目前不支持，但可以在未来版本中添加多账号支持。

## 🔒 安全提醒

⚠️ **凭证保护：**
- FCM 凭证可以接收你的游戏推送
- 不要在公共场合展示凭证
- 不要分享你的凭证命令
- 凭证存储在本地 `~/.rustplus/config/` 目录

## 🛠️ 开发

### 后端开发
```bash
cd backend
npm run dev  # 使用 nodemon 自动重启
```

### 前端开发
```bash
cd frontend
npm run dev  # Vite 热重载
```

### 构建
```bash
# 前端构建
cd frontend
npm run build
```

## 📄 许可证

MIT

## 🙏 致谢

- [@liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js) - Rust+ API 库
- [@liamcottle/push-receiver](https://github.com/MatthieuLemoine/push-receiver) - FCM 推送接收库
- [Facepunch Studios](https://rust.facepunch.com/) - Rust 游戏开发商

---

**版本:** 2.0.0
**更新日期:** 2025-10-18
**状态:** ✅ 稳定版
