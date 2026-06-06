
永远使用中文回复。

本文件用于给代码代理（Codex/Claude/Gemini 等）提供本仓库的统一开发规则。

## 项目定位
- Rust+ Web Dashboard：多租户 SaaS Rust 游戏服务器管理面板。
- 核心能力：服务器连接、队伍聊天、设备控制、事件监控、玩家追踪、订阅支付、后台运营管理。

## 技术栈
- 后端：Node.js 20 + Express + mysql2 + Socket.io（ESM）。
- 前端：React 18 + Vite 5 + Tailwind CSS + Axios + socket.io-client。
- 第三方：`@liamcottle/rustplus.js`、BattleMetrics、支付宝。

## 关键目录
- `backend/src/app.js`：后端入口，初始化路由、WebSocket、全局服务、调度器。
- `backend/src/services/`：服务层（global-manager、user-*、websocket、payment、battlemetrics 等）。
- `backend/src/routes/`：REST API 路由（auth/server/pairing/tracking/admin/payment 等）。
- `backend/src/middleware/auth.middleware.js`：`authenticate`/`requireAdmin`/`requireActiveSubscription`。
- `backend/src/lib/db.js`：mysql2 连接池与事务入口。
- `backend/sql/init.sql`：数据库结构基线（source of truth）。
- `frontend/src/services/`：前端 API 与 Socket 封装。
- `docs/`：核心架构与运维文档（优先参考）。

## 架构硬规则（必须遵守）

### 1) 多租户隔离
- 涉及用户数据的 SQL 必须带 `userId` 过滤，或先做资源归属校验（如先查 `servers.id + userId`）。
- 读取/修改 `servers`、`devices`、`event_logs`、`tracked_players`、`tracking_events` 等数据时，必须校验归属。
- 禁止跨用户查询、跨用户推送、跨用户状态修改。
- 全局共享数据（如 `subscription_plans`、`public_servers`、`tracked_player_cache`）仅可按业务场景访问，不得混入用户隐私数据。

### 2) 服务实例模型
- `GlobalServiceManager` 是全局单例，统一管理 `Map<userId, UserServiceManager>`。
- `UserServiceManager` 是每用户一实例，统一管理 Rust+、FCM、事件监控、自动化、命令、昼夜提醒、玩家追踪。
- 新增用户级能力优先挂在 `UserServiceManager`，通过 `EventEmitter` 向上转发到全局层，再转发给 WebSocket。

### 3) 认证与订阅
- 受保护路由必须使用 `authenticate`。
- 管理后台路由必须叠加 `requireAdmin`。
- 连接服务器、设备控制、发送消息、配对启动等写操作必须评估并使用 `requireActiveSubscription`。
- WebSocket 握手必须校验 JWT，连接后加入 `user:${userId}` 房间。

### 4) WebSocket 事件约定
- 客户端请求：`resource:action`（例：`server:connect`、`device:control`）。
- 成功响应：`resource:action:success`。
- 失败响应：`resource:action:error`。
- 用户数据推送必须使用 `io.to("user:${userId}")`（或等价模板字符串），禁止 `io.emit` 广播用户数据。
- 仅“全局配置类事件”允许广播，且 payload 禁止包含用户私有信息。

### 5) 数据库变更流程
- 不使用 ORM 迁移工具。
- 本项目仅维护 `backend/sql/init.sql` 一份数据库结构脚本。
- 表结构变更必须直接更新 `backend/sql/init.sql`，并同时：
    1. 补齐索引、外键与默认值；
    2. 评估并补齐多租户字段（尤其是 `userId`）。

## 编码规范

### 后端
- 使用 ES Module（`import/export`）并与现有风格一致。
- 统一使用参数化查询（`?` 占位符），禁止字符串拼接 SQL。
- 路由层保持轻量：参数校验 + 权限校验 + 调用 service，避免在路由堆积复杂业务。
- 跨表写操作优先使用事务（`getConnection` + `beginTransaction`）。

### 前端
- API 调用统一放在 `frontend/src/services/api.js` 或对应 service 文件。
- Socket 调用统一通过 `frontend/src/services/socket.js`。
- 鉴权依赖 localStorage token + Axios 拦截器，禁止破坏现有登录态流程。
- 优先复用现有组件与样式体系，避免重复实现同类面板/弹窗。
- **UI 一律遵循战术遥测设计系统（Tactical Telemetry），详见 `docs/DESIGN_SYSTEM.md`**。改前端必须复用设计 token（`ink/fg/hazard/terminal`）与 `.tac-*` 组件基类，不要手写一套。核心铁律：
    - 唯一强调色 hazard 红（`#E0452E`），**禁蓝/紫/绿**（terminal 绿仅用于单点状态如 online）；
    - 中文**绝不** `italic`/`uppercase`/`tracking-widest`，仅纯英文标签（FCM/LINK/ONLINE）用 mono + 大写 + 字距；
    - 零圆角（直角 + 发丝线网格 + 四角角标），布局全屏铺满、不居中限宽；
    - 内容结合 Rust 游戏实际（设备 = 智能开关/警报/储物监视器、TC 上料倒计时等）。

## 业务实现注意点
- 用户注册默认创建订阅记录，但到期时间初始为当前时间；有效订阅才会拉起用户服务实例。
- FCM 配对可能创建占位服务器（`ip = 0.0.0.0`），前端展示需过滤该占位数据。
- 支付回调需保证：签名校验、金额校验、幂等处理、订单状态流转正确。

## 服务器信息排查规则（线上）
- 当出现“已连接服务器与页面展示服务器信息不一致”“BattleMetrics 信息异常”“服务器详情明显错绑”时，允许并优先进行线上排查。
- 排查顺序固定为：`servers` 绑定信息（`id/userId/ip/port/battlemetricsId`）→ `public_servers` 对应缓存记录 → 后端接口实际响应 → PM2 日志（如 `/root/.pm2/logs/rust-main-out.log`、`/root/.pm2/logs/rust-main-error.log`）。
- 所有线上 SQL 查询/修复必须遵守多租户隔离，带 `userId` 过滤或先做资源归属校验，禁止跨用户读取或修改。
- 需要修改线上数据时，必须先记录影响范围与回滚点，再执行修复；输出结论时必须包含“根因 + 修复动作 + 回滚方案”。
- 若怀疑 BattleMetrics 匹配逻辑问题，必须同时核对 IP 与端口，禁止只按 IP 唯一匹配后直接落库。

## 线上排查固定连接信息（敏感）
- 仅用于线上复杂问题排查与日志定位，禁止外传、禁止发到公开仓库或工单截图中。
- SSH 主节点：`38.76.201.25`
- SSH 账号：`root`
- SSH 密码：`7q4ao2M2NosF`
- 服务器项目目录：`/www/wwwroot/rust-bot`
- 线上环境变量文件：`/www/wwwroot/rust-bot/.env`
- PM2 日志目录：`/root/.pm2/logs`
- 关键日志文件：`/root/.pm2/logs/rust-main-out.log`、`/root/.pm2/logs/rust-main-error.log`、`/root/.pm2/logs/rust-connector-1-out.log`、`/root/.pm2/logs/rust-connector-1-error.log`
- MySQL 连接信息：`DB_HOST=127.0.0.1`，`DB_PORT=3306`，`DB_USER=rustapp`，`DB_PASSWORD=xlCodReFpZxUBrv3mFF1jk6x`，`DB_NAME=rustplus_db`
- MySQL 排查命令示例：`mysql -h127.0.0.1 -P3306 -urustapp -p'xlCodReFpZxUBrv3mFF1jk6x' rustplus_db`

## 开发命令
- 后端开发：`cd backend && npm run dev`
- 后端生产：`cd backend && npm start`
- 前端开发：`cd frontend && npm run dev`
- 前端构建：`cd frontend && npm run build`

## 变更自检清单
- SQL 是否满足多租户隔离（`userId` 过滤/归属校验）？
- 鉴权、管理员权限、订阅校验是否正确且未绕过？
- WebSocket 事件命名、success/error 回包、房间隔离是否一致？
- 是否误将用户数据做了全局广播？
- 数据库字段变更是否已同步到 `backend/sql/init.sql`？
- 前端是否仍通过 `services` 层访问后端？

## 提交约定
- 提交信息格式：`type: 描述`（feat/fix/refactor/chore/docs）。
- 禁止添加 AI 签名（如 `Co-Authored-By`）。
- 不做与任务无关的大规模重构。
