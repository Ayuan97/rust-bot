<p align="center">
  <img src="docs/assets/logo.png" alt="Rust+ Web Dashboard" width="120" />
</p>

<h1 align="center">Rust+ Web Dashboard</h1>

<p align="center">
  多租户 SaaS Rust+ 游戏助手，无需打开游戏即可监控服务器、与队友聊天、控制智能设备。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.1.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License" />
</p>

---

## 功能特性

| 类别 | 功能 |
|------|------|
| **SaaS** | 用户注册、订阅管理、支付宝支付、多租户隔离 |
| **监控** | 服务器状态、队伍聊天、事件追踪（货船/直升机/油井） |
| **控制** | 智能设备开关、PTZ 摄像头、自动化规则 |
| **通知** | 队友上下线/死亡、游戏事件、袭击检测 |

## 快速开始

### Docker 部署（推荐）

```bash
./docker-start.sh
# 或: docker-compose up -d
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3002 |
| 后端 | http://localhost:3001/api |

### 本地部署

```bash
# 后端
cd backend && npm install && npm run dev

# 前端（新终端）
cd frontend && npm install && npm run dev
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:3000/api |

## 首次使用

1. **注册账号** - 访问前端，注册后自动获得 7 天试用
2. **获取凭证** - 点击「开始配对」→「自动注册」→ Steam 登录 → 复制凭证命令
3. **配对服务器** - 游戏内 ESC → Rust+ → Pair with Server
4. **配对设备** - 游戏内靠近设备按住 E → Pair

## 游戏内命令

| 命令 | 说明 | 命令 | 说明 |
|------|------|------|------|
| `!help` | 显示帮助 | `!time` | 游戏时间 |
| `!pop` | 服务器人数 | `!team` | 队伍统计 |
| `!cargo` | 货船位置 | `!heli` | 直升机位置 |
| `!shop <物品>` | 搜索售货机 | `!<设备名>` | 控制设备 |

完整命令见 [docs/COMMANDS_GUIDE.md](docs/COMMANDS_GUIDE.md)

## 设备自动化

| 模式 | 说明 |
|------|------|
| 手动 | 仅手动控制 |
| 白天/夜晚开启 | 按游戏时间自动开关 |
| 始终开启/关闭 | 保持固定状态 |
| 在线/离线开启 | 按队友在线状态自动开关 |

## 环境变量

```env
# backend/.env
DATABASE_URL="mysql://user:pass@localhost:3306/rust_dashboard"
JWT_SECRET=your-secret-key
PORT=3000
FRONTEND_URL=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| 收不到推送 | 检查 FCM 连接状态，重新获取凭证，配置代理 |
| 配对失败 | 确保 FCM 已连接，重新点击 Pair with Server |
| 设备无法控制 | 确保设备已配对且有电源 |
| 连接超时 | 检查 IP/端口，确认 app.port 已配置，尝试代理 |

## 文档

| 文档 | 说明 |
|------|------|
| [Docker 部署](DOCKER.md) | Docker 部署指南 |
| [代理配置](docs/PROXY_SETUP.md) | 中国大陆代理配置 |
| [API 参考](docs/ADMIN_API.md) | 后端 API 文档 |
| [架构说明](docs/ARCHITECTURE.md) | 系统架构详解 |

## 致谢

- [@liamcottle/rustplus.js](https://github.com/liamcottle/rustplus.js)
- [alexemanuelol/rustplusplus](https://github.com/alexemanuelol/rustplusplus)
- [Facepunch Studios](https://rust.facepunch.com/)

## 许可证

[MIT License](LICENSE)

---

<p align="center">
  <b>版本:</b> 3.1.0 | 💬 微信: <b>Ayuan-223</b>
</p>
