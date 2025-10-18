# Rust+ Web Dashboard

一个基于 Web 的 Rust+ 游戏服务器管理面板，可以实时监控服务器状态、发送游戏内消息、控制智能设备等。

## ✨ 功能特性

- 🎮 **多服务器管理** - 同时连接和管理多个 Rust 服务器
- 🔐 **官方 Steam 认证** - 通过官方 Companion API 获取凭证
- 💬 **游戏内聊天** - 从网页发送消息到游戏队伍聊天
- 🔌 **智能设备控制** - 远程控制灯光、开关、门等智能设备
- 📊 **实时监控** - 查看在线玩家、队伍信息、游戏时间等
- 📢 **事件通知** - 玩家登录、死亡通知、智能警报
- ⚡ **实时通信** - 基于 WebSocket 的实时数据更新
- 🎨 **现代化 UI** - 响应式设计，支持移动端访问

## 🚀 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn

### 1. 克隆并安装

```bash
# 克隆仓库
git clone <repository-url>
cd rust-bot-new

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 配置环境变量

**后端配置** (`backend/.env`):
```env
PORT=3000
FRONTEND_URL=http://localhost:5173
```

**前端配置** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### 3. 启动服务

**方式一：使用启动脚本（推荐）**
```bash
./start.sh
```

**方式二：手动启动**
```bash
# 终端 1 - 启动后端
cd backend
npm run dev

# 终端 2 - 启动前端
cd frontend
npm run dev
```

访问 http://localhost:5173 即可使用！

---

## 🔐 认证配置

### ⚠️ 重要：首次使用必须先获取凭证

本项目需要通过官方 Companion API 获取 Steam 认证凭证。

### 认证步骤

1. **访问 Web 界面**
   - 打开 http://localhost:5173
   - 点击顶部"配对服务器"按钮

2. **输入凭证**
   - 点击"输入 FCM 凭证"按钮

3. **Steam 登录**
   - 点击"Steam 登录获取凭证"按钮
   - 在新窗口中登录你的 Steam 账号：
     ```
     https://companion-rust.facepunch.com/login
     ```

4. **复制凭证**
   - 登录成功后，页面会显示凭证信息：
     ```
     /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx issued_date:xxx expire_date:xxx
     ```

5. **填写表单**
   - 将参数填入表单：
     - GCM Android ID (必填)
     - GCM Security Token (必填)
     - Steam ID (必填)
     - Issued Date (可选)
     - Expire Date (可选)

6. **保存并开始监听**
   - 点击"保存并开始监听"
   - 系统会自动开始监听推送

7. **游戏内配对**
   - 进入 Rust 游戏中的任意服务器
   - 按 `ESC` 打开菜单
   - 点击右下角 **Rust+** 图标
   - 点击 **"Pair with Server"**

8. **自动完成**
   - ✅ 服务器信息自动保存
   - ✅ 自动连接到服务器
   - ✅ 可以立即使用所有功能

**详细认证流程**: 查看 [STEAM_AUTH_FLOW.md](STEAM_AUTH_FLOW.md)

---

## 📖 使用说明

### 管理服务器

**通过游戏内配对（推荐）**
1. 点击"配对服务器"按钮
2. 如果未配置凭证，先完成认证流程
3. 点击"启动配对监听"
4. 在游戏中按 ESC → Rust+ → Pair with Server
5. 配对成功后自动保存并连接

**手动添加服务器**
1. 点击"手动添加"按钮
2. 填写服务器信息：
   - 名称
   - IP 地址
   - 端口（通常是游戏端口 + 67）
   - Player ID（Steam 64 位 ID）
   - Player Token（配对令牌，负数）

### 发送消息

1. 选择已连接的服务器
2. 在右侧"队伍聊天"面板输入消息
3. 点击"发送"
4. 消息将显示在游戏内队伍聊天

### 控制智能设备

**通过游戏内配对（推荐）**
1. 在游戏中对着智能设备（灯、开关等）
2. 按住 `E` 键，点击 "Pair" 按钮
3. 设备会自动添加到 Dashboard

**手动添加**
1. 点击"添加设备"按钮
2. 填写设备信息（需要 Entity ID）
3. 点击开关按钮控制设备

---

## 🏗️ 技术栈

**后端**
- Node.js + Express
- Socket.io（实时通信）
- [@liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js)（Rust+ API）
- SQLite（数据存储）

**前端**
- React + Vite
- TailwindCSS
- Socket.io-client
- React Icons

---

## 📂 项目结构

```
rust-bot-new/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── services/        # 核心服务
│   │   │   ├── fcm.service.js       # FCM 推送监听
│   │   │   ├── rustplus.service.js  # Rust+ 连接管理
│   │   │   └── websocket.service.js # WebSocket 服务
│   │   ├── routes/          # API 路由
│   │   │   ├── pairing.routes.js    # 配对相关 API
│   │   │   └── server.routes.js     # 服务器管理 API
│   │   ├── models/          # 数据模型
│   │   └── app.js           # 主应用
│   └── package.json
│
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── components/      # React 组件
│   │   │   ├── CredentialsInput.jsx # 凭证输入
│   │   │   ├── PairingPanel.jsx     # 配对面板
│   │   │   ├── ServerCard.jsx       # 服务器卡片
│   │   │   ├── ChatPanel.jsx        # 聊天面板
│   │   │   └── DeviceControl.jsx    # 设备控制
│   │   ├── services/        # API 服务
│   │   │   ├── api.js              # HTTP API
│   │   │   ├── socket.js           # WebSocket
│   │   │   └── pairing.js          # 配对 API
│   │   └── App.jsx          # 主应用
│   └── package.json
│
├── docs/                    # 文档
│   ├── ARCHITECTURE.md      # 技术架构
│   ├── API_CHANNELS.md      # API 频道说明
│   └── archive/             # 归档文档
│
├── README.md                # 本文件
├── STEAM_AUTH_FLOW.md       # Steam 认证流程
├── SETUP_GUIDE.md           # 安装指南
└── start.sh                 # 启动脚本
```

---

## 🔌 API 文档

### REST API

**配对相关**
- `GET /api/pairing/status` - 获取配对状态
- `POST /api/pairing/start` - 启动 FCM 监听
- `POST /api/pairing/stop` - 停止监听
- `POST /api/pairing/credentials/manual` - 手动提交凭证

**服务器管理**
- `GET /api/servers` - 获取所有服务器
- `POST /api/servers` - 添加服务器
- `DELETE /api/servers/:id` - 删除服务器
- `GET /api/servers/:id/devices` - 获取设备列表
- `POST /api/servers/:id/devices` - 添加设备

### WebSocket 事件

**客户端发送**
- `server:connect` - 连接到 Rust+ 服务器
- `server:disconnect` - 断开连接
- `message:send` - 发送队伍消息
- `device:control` - 控制设备

**服务器推送**
- `server:paired` - 服务器配对成功
- `entity:paired` - 设备配对成功
- `player:login` - 玩家登录通知
- `player:death` - 玩家死亡通知
- `alarm` - 智能警报触发
- `team:message` - 收到队伍消息
- `entity:changed` - 设备状态改变

**详细 API 说明**: 查看 [docs/API_CHANNELS.md](docs/API_CHANNELS.md)

---

## ❓ 常见问题

### Q: 配对失败怎么办？

A: 检查以下几点：
1. 确保已完成 Steam 认证并输入凭证
2. 检查凭证是否有效（未过期）
3. 确保点击了"启动配对监听"
4. 查看后端日志是否有错误

### Q: 凭证过期了怎么办？

A:
1. 点击"重置 FCM 凭证"
2. 重新进行 Steam 登录
3. 获取新的凭证并填写

凭证通常有效期为 14 天。

### Q: 可以同时管理多个服务器吗？

A: 可以！Dashboard 支持同时连接多个服务器，在左侧列表中切换即可。

### Q: 智能设备控制失败？

A:
1. 确保设备已配对
2. 检查设备是否有电源
3. 尝试在游戏中重新配对设备

### Q: 为什么必须使用 Steam 登录？

A: 这是官方认证流程：
```
Steam 登录 → 获取 Auth Token → 绑定到 Companion API → 接收推送
```
没有这个步骤，系统无法知道要推送给谁，配对功能无法工作。

---

## 🛣️ 开发路线图

- [x] FCM 推送监听和自动配对
- [x] 官方 Steam 认证集成
- [x] 游戏内服务器配对
- [x] 游戏内设备配对
- [x] 实时队伍聊天
- [x] 智能设备控制
- [x] 玩家登录/死亡通知
- [x] 智能警报处理
- [ ] 前端事件历史记录
- [ ] 数据统计和图表
- [ ] 设备自动化脚本
- [ ] 移动端优化
- [ ] 多语言支持
- [ ] Docker 部署支持

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [@liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js) - Rust+ API 库
- [Rust Companion API](https://companion-rust.facepunch.com) - 官方 API
- [rustplusplus](https://github.com/alexemanuelol/rustplusplus) - 功能参考

---

## 📞 支持

如有问题或建议，请提交 Issue 或 Pull Request。

**最后更新**: 2025-10-18
