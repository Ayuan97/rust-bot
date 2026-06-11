# 部署与运维（权威文档）

> 线上任何部署 / 排查前先读本文件。它是部署体系的**唯一权威来源**；README / CLAUDE.md / deploy/README.md 只做指引，细节一律以本文件为准。
> 敏感凭据（SSH / DB 密码、仓库 token）见本机 `temp/ssh_run.py`、线上 `.env`、`deploy/` 脚本，本文件不明文重复。

## 一、服务器与架构
- **生产主节点**：公网 `160.202.47.238`（内网 `10.0.176.2`），域名 `rustplusplus.com`（Nginx + Let's Encrypt HTTPS）。
- **API 子域**：`api.rustplusplus.com`（nginx 站点 `rustbot-api` 反代到 `127.0.0.1:3000`）。前端是跨域请求它的。
- **单机部署**：同一台机器同时跑 `rust-main`（主控）+ `rust-connector-1`（本地子节点 node-1）+ `rust-proxy`（Mihomo 代理，可选），PM2 托管，本地 MariaDB（库 `rustplus_db` / 用户 `rustapp`）。
- **SSH**：`root@160.202.47.238`，凭据由用户保管（本机 `temp/ssh_run.py` 临时调用）。

## 二、关键目录（部署最易混淆，务必分清）
| 用途 | 路径 |
|---|---|
| 代码仓库（git pull / npm build 都在这） | `/www/wwwroot/rust-bot` |
| 前端构建产物（vite 输出，**中间物**） | `…/rust-bot/frontend/dist` |
| 🔴 **nginx 实际服务的前端目录（最终落地）** | **`/var/www/rustbot`** |
| 线上环境变量 | `…/rust-bot/.env` |
| PM2 日志 | `/root/.pm2/logs/`（`rust-main-*`、`rust-connector-1-*`） |

> `frontend/dist`（构建产物）和 `/var/www/rustbot`（nginx 服务）是**两个不同目录**，二者都必需。前端构建后**必须 `rsync` 同步过去**，否则线上还是旧文件。

## 三、关键环境变量（根目录 `.env`，迁移 / 重建必带）
| 变量 | 值 / 说明 |
|---|---|
| `VITE_API_URL` | `https://api.rustplusplus.com/api` — 前端 API 地址，vite 构建时读；**漏配前端会回退到 localhost、用户登录全挂** |
| `VITE_SOCKET_URL` | `https://api.rustplusplus.com` — 前端 socket 地址 |
| `STEAM_API_KEY` | Steam Web API key — 漏配则队友头像 / Steam 战绩全空 |
| `INTERNAL_ALLOWED_IPS` | 内部接口白名单，默认 `127.0.0.1,::1`（单机）；加异地子节点需追加其公网 IP |
| `NODE_TOKEN_SECRET` | 签发子节点 JWT 的密钥 |
| `DB_*` / `JWT_SECRET` | 数据库与鉴权（`deploy-main.sh` 首次自动生成随机值） |

> ⚠️ vite 的 `envDir` 指向项目根，所以前端的 `VITE_*` 变量放在**根 `.env`**（不是 `frontend/.env`）。

## 四、部署流程（用脚本，别手敲）

### 日常更新（push 代码后）
```bash
cd /www/wwwroot/rust-bot
bash deploy/rustbot-update.sh main
```
一键完成：git 拉取 → `npm ci` 后端 → 构建前端 → **rsync 到 `/var/www/rustbot`** → 清日志 → 重启 rust-main + 本机子节点 → 健康检查 →（可选）扇出更新远程子节点。

### 首次全新部署
- 主节点：`bash deploy/deploy-main.sh`（装依赖 / 建库 / 生成 .env / 构建 / 起 pm2 / 配 nginx+SSL）
- 子节点：`bash deploy/deploy-connector.sh`（填主节点地址 + NODE_TOKEN，起 rust-connector，不连数据库）
- 可选代理：`bash deploy/setup-proxy.sh`（子节点出口 IP 被封时启用 Mihomo）

### 运维
- 重启：`bash deploy/rustbot-restart.sh`（rust-main + 本机所有子节点）
- 清日志：`bash deploy/rustbot-clean-logs.sh`

> 各脚本职责详见 `deploy/README.md`。

## 五、血泪教训（都踩过）
- 🩸 **前端构建后必须 rsync 到 `/var/www/rustbot`** — nginx 服务的不是 `frontend/dist`。用 `rustbot-update.sh` 已封装；手动 build 千万别漏 rsync。
- 🩸 **根 `.env` 必须有 `VITE_API_URL` / `VITE_SOCKET_URL`（api 子域）** — 漏配前端 `auth.js` 会回退到硬编码 localhost、用户登录全失败。**验证前端要用真实域名的外部视角，别只在服务器本机 puppeteer 测**（本机 `localhost:3000` 正好是后端、会把问题藏住）。
- `STEAM_API_KEY` 漏配 → 队友头像 / Steam 战绩全空。
- 改 `.env` 后 `pm2 restart --update-env`；单机子节点与主节点**共用同一份 `.env`**（`NODE_TOKEN` / `CONTROL_API_URL` 追加在末尾，别覆盖）。
- 线上 SQL 排查必须带 `userId` 隔离；改数据前先记录影响范围与回滚点。

## 六、线上排查顺序
`servers` 绑定信息（`id/userId/ip/port/battlemetricsId`）→ `public_servers` 缓存 → 后端接口实际响应 → PM2 日志（`/root/.pm2/logs/rust-main-out.log` / `-error.log`）。
