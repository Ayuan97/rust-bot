# 重构 TODO 清单

> **状态说明**：
> - ⏳ 待开始
> - 🚧 进行中
> - ✅ 已完成
> - ⏸️ 已暂停
> - ❌ 已取消

---

## 阶段 1：基础架构（2 周）

### Week 1: 环境搭建和认证系统

#### TODO-001: 搭建 Docker Compose 环境 ⏳
**优先级**: P0
**预计工时**: 4 小时

**任务描述**：
1. 创建 `docker-compose.yml` 文件
2. 配置 MySQL 8.0 服务
3. 配置 Redis 7.0 服务
4. 配置代理服务（V2Ray/Xray）
5. 配置后端服务
6. 配置网络和卷

**完成标准**：
- [ ] `docker-compose up` 可以启动所有服务
- [ ] MySQL 可以正常连接
- [ ] Redis 可以正常连接
- [ ] 代理服务正常运行
- [ ] 后端服务可以访问 MySQL 和 Redis

**依赖**：无

---

#### TODO-002: Prisma Schema 设计 ⏳
**优先级**: P0
**预计工时**: 6 小时

**任务描述**：
1. 创建 `prisma/schema.prisma` 文件
2. 定义所有数据库表模型：
   - users（用户表）
   - subscriptions（订阅订单表）
   - servers（服务器表）
   - devices（设备表）
   - fcm_credentials（FCM 凭证表）
   - event_logs（事件日志表）
   - notification_settings（通知设置表）
3. 设置外键关系和索引
4. 配置 MySQL 连接

**完成标准**：
- [ ] Schema 文件定义完整
- [ ] 所有表包含 user_id 字段
- [ ] 外键级联删除配置正确
- [ ] 索引配置合理
- [ ] `prisma migrate dev` 可以创建数据库

**依赖**：TODO-001

**参考**：`商业化重构计划.md` 第四章

---

#### TODO-003: 用户注册 API ⏳
**优先级**: P0
**预计工时**: 4 小时

**任务描述**：
1. 创建 `routes/auth.routes.js`
2. 实现 `POST /api/auth/register` 接口：
   - 接收 email、password
   - 验证邮箱格式
   - 检查邮箱是否已存在
   - 使用 bcrypt 加密密码
   - 创建用户记录
   - 自动设置 7 天试用期（subscription_expires_at）
   - 返回 JWT Token
3. 创建 `services/auth.service.js`

**完成标准**：
- [ ] 可以成功注册用户
- [ ] 密码正确加密
- [ ] 重复邮箱返回错误
- [ ] 自动获得 7 天试用
- [ ] 返回有效的 JWT Token

**依赖**：TODO-002

---

#### TODO-004: 用户登录 API ⏳
**优先级**: P0
**预计工时**: 3 小时

**任务描述**：
1. 实现 `POST /api/auth/login` 接口：
   - 接收 email、password
   - 验证用户是否存在
   - 验证密码是否正确
   - 返回 JWT Token
2. 更新用户 last_login_at

**完成标准**：
- [ ] 正确的账号密码可以登录
- [ ] 错误的密码返回错误
- [ ] 不存在的用户返回错误
- [ ] 返回有效的 JWT Token
- [ ] last_login_at 正确更新

**依赖**：TODO-003

---

#### TODO-005: JWT 认证中间件 ⏳
**优先级**: P0
**预计工时**: 3 小时

**任务描述**：
1. 创建 `middleware/auth.middleware.js`
2. 实现 JWT 验证中间件：
   - 从 Header 获取 Token
   - 验证 Token 有效性
   - 解析用户 ID
   - 将用户信息添加到 req.user
3. 创建订阅检查中间件：
   - 检查 subscription_expires_at
   - 过期返回 403 错误

**完成标准**：
- [ ] 有效 Token 可以通过验证
- [ ] 无效 Token 返回 401 错误
- [ ] 过期订阅返回 403 错误
- [ ] req.user 包含用户信息

**依赖**：TODO-004

---

### Week 2: 数据库改造和服务框架

#### TODO-006: 数据库多租户改造 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 修改所有现有数据模型：
   - storage.model.js（服务器、设备、事件日志）
   - config.model.js（FCM 凭证、通知设置）
2. 所有查询添加 user_id 过滤
3. 所有插入操作添加 user_id
4. 创建数据迁移脚本（SQLite → MySQL）

**完成标准**：
- [ ] 所有查询包含 user_id
- [ ] 所有插入包含 user_id
- [ ] 不同用户数据完全隔离
- [ ] 迁移脚本可用

**依赖**：TODO-002

---

#### TODO-007: GlobalServiceManager 实现 ⏳
**优先级**: P0
**预计工时**: 6 小时

**任务描述**：
1. 创建 `services/global-manager.service.js`
2. 实现核心方法：
   - `initializeAllActiveUsers()` - 启动时初始化所有有效用户
   - `createUserService(userId)` - 创建用户服务实例
   - `removeUserService(userId)` - 删除用户服务实例
   - `getUserService(userId)` - 获取用户服务实例
   - `checkExpiredSubscriptions()` - 定时检查订阅到期
3. 使用 Map 存储用户实例
4. 启动定时任务（每小时检查）

**完成标准**：
- [ ] 可以创建用户服务实例
- [ ] 可以删除用户服务实例
- [ ] 应用启动时自动初始化有效用户
- [ ] 定时任务正常运行
- [ ] 订阅到期自动清理

**依赖**：TODO-006

---

#### TODO-008: UserServiceManager 基础实现 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 创建 `services/user-service-manager.js`
2. 实现 UserServiceManager 类：
   - 构造函数（接收 userId）
   - `initialize()` - 初始化服务
   - `shutdown()` - 停止所有服务
   - 子服务占位符（后续实现）
3. 继承 EventEmitter
4. 添加生命周期管理

**完成标准**：
- [ ] 可以创建实例
- [ ] 可以初始化
- [ ] 可以停止
- [ ] 正确触发事件

**依赖**：TODO-007

---

## 阶段 2：核心功能重构（3 周）

### Week 3: RustPlus 和 FCM 用户隔离

#### TODO-009: RustPlusManager 用户隔离 ✅
**优先级**: P0
**预计工时**: 10 小时
**实际工时**: 8 小时
**完成时间**: 2026-01-03

**任务描述**：
1. 创建 `services/user-rustplus-manager.js`
2. 将 RustPlusService 改造为用户级别：
   - 接收 userId 参数
   - 独立的 servers Map
   - `connect(serverConfig)` - 连接服务器
   - `disconnect(serverId)` - 断开连接
   - `getServerInfo(serverId)` - 获取服务器信息
3. 所有操作仅针对该用户的服务器

**完成标准**：
- [x] 每个用户有独立的连接池
- [x] 用户 A 看不到用户 B 的服务器
- [x] 连接、断开功能正常
- [x] 事件正确触发

**依赖**：TODO-008

**实现细节**：
- 创建了 `backend/src/services/user-rustplus-manager.js`（972 行）
- 集成到 `UserServiceManager`，在构造函数中实例化
- 实现了完整的连接池管理、自动重连、消息队列、摄像头管理
- 所有事件携带 `userId` 字段，便于多租户事件路由
- 创建了 `backend/test-rustplus-manager.js` 完整测试脚本
- 提交: e0c34e7

---

#### TODO-010: FCMManager 用户隔离 ✅
**优先级**: P0
**预计工时**: 8 小时
**实际工时**: 6 小时
**完成时间**: 2026-01-03

**任务描述**：
1. 创建 `services/user-fcm-manager.js`
2. 将 FCMService 改造为用户级别：
   - 接收 userId 参数
   - 独立的 PushReceiverClient 实例
   - `start(credentials)` - 启动 FCM 监听
   - `stop()` - 停止 FCM 监听
   - 从用户自己的 fcm_credentials 表加载凭证
3. 配对推送仅保存到该用户的数据库

**完成标准**：
- [x] 每个用户有独立的 FCM 监听器
- [x] 用户 A 的推送不会影响用户 B
- [x] 配对推送正确保存
- [x] 启动/停止功能正常

**依赖**：TODO-009

**实现细节**：
- 创建了 `backend/src/services/user-fcm-manager.js`（782 行）
- 集成到 `UserServiceManager`，在构造函数中实例化
- 实现了完整的 FCM 注册、监听、凭证管理
- 所有事件携带 `userId` 字段，便于多租户事件路由
- 支持 SOCKS5 代理和 HTTP 代理
- 创建了 `backend/test-fcm-manager.js` 完整测试脚本
- 提交: 32020aa

**注意事项**：
- FCM 凭证目前通过 loadCredentials() 方法加载，暂未实现数据库存储
- 后续可添加 User 表的 fcmCredentials 字段（JSON 类型）存储

---

#### TODO-011: WebSocket 认证 ✅
**优先级**: P0
**预计工时**: 4 小时
**实际工时**: 3 小时
**完成时间**: 2026-01-03

**任务描述**：
1. 修改 `services/websocket.service.js`
2. 添加 Socket.io 认证中间件：
   - 验证 JWT Token
   - 解析 userId
   - 保存到 socket.userId
3. 连接时加入用户房间：
   - `socket.join(`user:${userId}`)`

**完成标准**：
- [x] 无效 Token 无法连接
- [x] socket.userId 正确设置
- [x] 用户加入专属房间

**依赖**：TODO-005

**实现细节**：
- 修改了 `backend/src/services/websocket.service.js`：
  * 添加 `authenticateSocket()` 中间件方法
  * 支持两种 token 传递方式（auth.token 和 Authorization header）
  * 从数据库加载用户信息并验证状态
  * 将 userId、username、email、isAdmin 附加到 socket
  * 连接时自动加入 `user:${userId}` 房间
  * 增强连接/断开日志输出
- 创建了 `backend/test-websocket-auth.js` 完整测试脚本
- 安装了 `socket.io-client` 依赖用于测试
- 提交: f321bdc

**测试覆盖**：
- ✅ 无 token 连接被拒绝
- ✅ 无效 token 连接被拒绝
- ✅ 过期 token 连接被拒绝
- ✅ 有效 token 连接成功（auth.token）
- ✅ Authorization header 连接成功
- ✅ 被禁用用户连接被拒绝
- ✅ 订阅过期用户连接被拒绝
- ✅ 用户房间隔离已验证（通过日志）

---

#### TODO-012: WebSocket 房间隔离 ✅
**优先级**: P0
**预计工时**: 6 小时
**实际工时**: 5 小时
**完成时间**: 2026-01-03

**任务描述**：
1. 修改所有 WebSocket 事件广播：
   - 从 `io.emit()` 改为 `io.to(`user:${userId}`).emit()`
   - 确保消息只发送给对应用户
2. 修改所有事件监听：
   - 从 socket 获取 userId
   - 操作该用户的 UserServiceManager 实例

**完成标准**：
- [x] 用户 A 收不到用户 B 的消息
- [x] 所有事件正确路由到对应用户
- [x] 房间隔离完全生效

**依赖**：TODO-011

**实现细节**：
- **backend/src/services/websocket.service.js**：
  * 移除对全局 `rustPlusService` 的依赖
  * 改为导入 `globalServiceManager`
  * `setupEventHandlers()` 中添加 `getUserService()` 辅助函数
  * 所有客户端事件处理改为从 `globalServiceManager.getUserService(socket.userId)` 获取用户服务实例
  * 重命名 `setupRustPlusListeners()` 为 `setupGlobalServiceListeners()`
  * 所有事件广播从 `io.emit()` 改为 `io.to(`user:${userId}`).emit()`
  * 监听 GlobalServiceManager 的所有事件并转发到对应用户房间

- **backend/src/services/user-service-manager.js**：
  * 扩展 `_initializeServices()` 转发所有 RustPlus 事件
  * 新增事件监听：server:reconnecting, rust:message, team:message, team:changed, entity:changed, alarm:triggered, clan:changed, clan:message, camera:subscribing, camera:subscribed, camera:unsubscribed, camera:render, camera:rays
  * 所有事件已携带 userId 字段

- **backend/src/services/global-manager.service.js**：
  * 扩展 `_attachUserServiceListeners()` 转发所有用户服务事件
  * 新增事件转发：user:initialized, user:shutdown, server:reconnecting, rust:message, team:message, team:changed, entity:changed, alarm:triggered, clan:changed, clan:message, camera:subscribing, camera:subscribed, camera:unsubscribed, camera:render, camera:rays, server:paired, entity:paired, fcm:listening, fcm:stopped, fcm:error

- **backend/test-websocket-rooms.js**：
  * 创建两个测试用户并初始化服务实例
  * 两个客户端同时连接 WebSocket
  * 验证事件隔离（team:message, server:connected）
  * 验证客户端请求隔离
  * 所有测试通过 ✅

- 提交: c1db3b4

**测试覆盖**：
- ✅ 两个用户独立连接 WebSocket
- ✅ 用户 1 的事件只发给用户 1（房间隔离）
- ✅ 用户 2 的事件只发给用户 2（房间隔离）
- ✅ 多种事件类型隔离验证
- ✅ 客户端请求只操作自己的服务实例
- ✅ GlobalServiceManager 事件正确转发
- ✅ WebSocket 房间隔离完全生效

---

### Week 4: 事件监控和自动化用户隔离

#### TODO-013: EventMonitor 用户隔离 ✅
**优先级**: P0
**预计工时**: 8 小时
**实际工时**: 6 小时

**任务描述**：
1. 创建 `services/user-event-monitor.js`
2. 将 EventMonitorService 改造为用户级别：
   - 接收 userId 参数
   - 仅监控该用户的服务器
   - 事件保存到该用户的 event_logs 表
3. 集成到 UserServiceManager

**完成标准**：
- [x] 每个用户有独立的事件监控
- [x] 事件日志正确隔离
- [x] 轮询独立运行

**依赖**：TODO-009

**实现细节**：
- **backend/src/services/user-event-monitor.js**：
  * 构造函数接收 userId 和 rustPlusService
  * loadNotificationSettings() - 从数据库加载用户通知设置
  * isNotificationEnabled(key) - 检查用户级别的通知开关
  * saveEventLog(serverId, eventType, eventData) - 保存事件到 event_logs（通过 Server 关系）
  * start(serverId) - 启动服务器监控
  * stop(serverId) - 停止服务器监控
  * stopAll() - 停止所有监控
  * 完整事件监控：货船、直升机、玩家、CH47、箱子、爆炸、售货机
  * 所有事件携带 userId 字段

- **backend/src/services/user-service-manager.js**：
  * 导入 UserEventMonitor
  * 构造函数中实例化 eventMonitorService
  * _initializeServices() 绑定事件转发
  * _connectToServers() 连接成功后启动监控
  * _shutdownServices() 停止监控
  * getStatus() 返回监控状态

- **backend/src/services/global-manager.service.js**：
  * _attachUserServiceListeners() 转发事件监控事件
  * 新增转发：cargo:spawn, cargo:egress, cargo:dock, cargo:leave, heli:spawn, heli:downed, heli:leave, player:died, player:online, player:offline, player:afk

- **backend/test-event-monitor.js**：
  * 创建两个测试用户并初始化服务
  * 验证 EventMonitor 实例化
  * 验证用户隔离（userId 字段）
  * 验证通知设置加载
  * 验证事件隔离（模拟事件）
  * 验证事件日志保存（用户级别）
  * 所有测试通过 ✅

- 提交: be112f8

**测试覆盖**：
- ✅ UserEventMonitor 创建和初始化
- ✅ 用户隔离验证（userId 字段）
- ✅ 通知设置用户级别加载
- ✅ 事件隔离验证（每个用户只收到自己的事件）
- ✅ 事件日志保存到用户的 event_logs
- ✅ 数据库查询通过 server.userId 过滤
- ✅ 集成到 UserServiceManager
- ✅ GlobalServiceManager 正确转发事件
- ✅ 服务生命周期管理

---

#### TODO-014: Automation 用户隔离 ✅
**优先级**: P0
**预计工时**: 8 小时
**实际工时**: 5 小时

**任务描述**：
1. 创建 `services/user-automation.js`
2. 将 AutomationService 改造为用户级别：
   - 接收 userId 参数
   - 仅处理该用户的设备
   - 从该用户的 devices 表加载配置
3. 集成到 UserServiceManager

**完成标准**：
- [x] 每个用户有独立的自动化
- [x] 设备控制正确隔离
- [x] 自动化规则正确应用

**依赖**：TODO-013

**实现细节**：
- **backend/src/services/user-automation.js**：
  * 构造函数接收 userId 和 rustPlusService
  * getDevicesWithAutoMode(serverId) - 从 Prisma 查询用户设备（自动过滤 userId）
  * updateDeviceReachable(serverId, entityId, reachable) - 更新设备可达状态
  * checkAutomation(serverId) - 检查并执行自动化规则（30秒轮询）
  * processDevice(serverId, device, ctx) - 处理单个设备自动化
  * evaluateAutoMode(device, ctx) - 评估设备应该开/关/不变
  * start(serverId) - 启动服务器自动化
  * stop(serverId) - 停止服务器自动化
  * stopAll() - 停止所有自动化
  * 支持自动化模式：DAY_ON, NIGHT_ON, ALWAYS_ON, ALWAYS_OFF, ONLINE_ON, ONLINE_OFF
  * 所有事件携带 userId 字段

- **backend/src/services/user-service-manager.js**：
  * 导入 UserAutomation
  * 构造函数中实例化 automationService
  * _initializeServices() 绑定事件转发
  * _connectToServers() 连接成功后启动自动化
  * _shutdownServices() 停止自动化
  * getStatus() 返回自动化状态

- **backend/src/services/global-manager.service.js**：
  * _attachUserServiceListeners() 转发自动化事件
  * 新增转发：automation:executed

- **backend/test-automation.js**：
  * 创建两个测试用户并初始化服务
  * 创建测试服务器和设备（不同自动化模式）
  * 验证 Automation 实例化
  * 验证用户隔离（userId 字段）
  * 验证设备查询（用户级别隔离）
  * 验证跨用户查询返回空
  * 验证事件隔离（模拟自动化执行）
  * 所有测试通过 ✅

- 提交: 4e24a77

**测试覆盖**：
- ✅ UserAutomation 创建和初始化
- ✅ 用户隔离验证（userId 字段）
- ✅ 设备查询用户级别隔离
- ✅ 跨用户查询返回空（设备隔离）
- ✅ 自动化事件隔离（每个用户只收到自己的事件）
- ✅ 数据库查询通过 server.userId 过滤
- ✅ 集成到 UserServiceManager
- ✅ GlobalServiceManager 正确转发事件
- ✅ 服务生命周期管理

---

#### TODO-015: Commands 用户隔离 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 创建 `services/user-commands.js`
2. 将 CommandsService 改造为用户级别：
   - 接收 userId 参数
   - 仅处理该用户服务器的命令
   - 设备命令从该用户的 devices 表加载
3. 集成到 UserServiceManager

**完成标准**：
- [ ] 每个用户有独立的命令系统
- [ ] 命令响应正确隔离
- [ ] 自定义设备命令正常工作

**依赖**：TODO-014

---

### Week 5: 订阅管理和数据迁移

#### TODO-016: 订阅检查定时任务 ⏳
**优先级**: P0
**预计工时**: 4 小时

**任务描述**：
1. 在 GlobalServiceManager 中实现定时任务
2. 每小时执行一次：
   - 查询 subscription_expires_at < now() - 3天 的用户
   - 调用 removeUserService() 停止服务
   - 发送邮件通知（可选）
3. 使用 node-cron 或 setInterval

**完成标准**：
- [ ] 定时任务正常运行
- [ ] 到期用户自动停止
- [ ] 日志正确记录

**依赖**：TODO-007

---

#### TODO-017: 服务启动逻辑 ⏳
**优先级**: P0
**预计工时**: 6 小时

**任务描述**：
1. 修改 `backend/src/app.js`
2. 应用启动时：
   - 初始化 GlobalServiceManager
   - 调用 initializeAllActiveUsers()
   - 为所有有效订阅用户创建实例
3. 优雅关闭处理：
   - 停止所有用户服务
   - 关闭数据库连接

**完成标准**：
- [ ] 应用启动时自动初始化所有用户
- [ ] 优雅关闭正常工作
- [ ] 日志完整清晰

**依赖**：TODO-016

---

#### TODO-018: 数据迁移脚本 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 创建 `scripts/migrate-sqlite-to-mysql.js`
2. 实现迁移逻辑：
   - 从 SQLite 读取所有数据
   - 创建默认用户（永久订阅）
   - 将所有数据归属到默认用户
   - 插入到 MySQL
   - 验证数据完整性
3. 添加回滚功能

**完成标准**：
- [ ] 可以成功迁移所有数据
- [ ] 数据完整性验证通过
- [ ] 迁移后功能正常
- [ ] 提供回滚方案

**依赖**：TODO-006

---

## 阶段 3：支付集成（2 周）

### Week 6: 支付宝集成

#### TODO-019: 订单管理 API ⏳
**优先级**: P1
**预计工时**: 6 小时

**任务描述**：
1. 创建 `routes/payment.routes.js`
2. 实现订单 API：
   - `POST /api/payment/create-order` - 创建订单
   - `GET /api/payment/orders` - 查询订单列表
   - `GET /api/payment/orders/:id` - 查询订单详情
3. 创建 `services/payment.service.js`

**完成标准**：
- [ ] 可以创建订单
- [ ] 可以查询订单
- [ ] 订单状态正确
- [ ] 数据正确保存

**依赖**：TODO-005

---

#### TODO-020: 支付宝 SDK 集成 ⏳
**优先级**: P1
**预计工时**: 8 小时

**任务描述**：
1. 安装 alipay-sdk
2. 配置支付宝参数（APP_ID、私钥、公钥）
3. 实现支付创建：
   - 生成支付链接（PC 网站支付）
   - 生成二维码（扫码支付）
4. 测试沙箱环境

**完成标准**：
- [ ] 可以生成支付链接
- [ ] 沙箱环境测试通过
- [ ] 配置参数正确加密

**依赖**：TODO-019

---

#### TODO-021: 支付宝回调处理 ⏳
**优先级**: P1
**预计工时**: 6 小时

**任务描述**：
1. 实现 `POST /api/payment/callback/alipay`
2. 验证签名
3. 更新订单状态
4. 延长用户订阅时间：
   - subscription_expires_at += duration_days
5. 触发服务创建/恢复（如果实例不存在）

**完成标准**：
- [ ] 签名验证正确
- [ ] 订单状态正确更新
- [ ] 订阅时间正确延长
- [ ] 服务自动恢复

**依赖**：TODO-020

---

### Week 7: 微信支付集成

#### TODO-022: 微信支付 SDK 集成 ⏳
**优先级**: P1
**预计工时**: 8 小时

**任务描述**：
1. 安装 wechatpay-node-v3
2. 配置微信支付参数（MCHID、API_KEY、证书）
3. 实现支付创建：
   - 生成 Native 支付二维码
   - 生成 JSAPI 支付参数（可选）
4. 测试沙箱环境

**完成标准**：
- [ ] 可以生成支付二维码
- [ ] 沙箱环境测试通过
- [ ] 证书配置正确

**依赖**：TODO-021

---

#### TODO-023: 微信支付回调处理 ⏳
**优先级**: P1
**预计工时**: 6 小时

**任务描述**：
1. 实现 `POST /api/payment/callback/wechat`
2. 解密回调数据
3. 验证签名
4. 更新订单状态
5. 延长用户订阅时间

**完成标准**：
- [ ] 解密和验证正确
- [ ] 订单状态正确更新
- [ ] 订阅时间正确延长
- [ ] 服务自动恢复

**依赖**：TODO-022

---

#### TODO-024: 支付流程端到端测试 ⏳
**优先级**: P1
**预计工时**: 4 小时

**任务描述**：
1. 使用内网穿透（ngrok）暴露本地服务
2. 完整测试支付宝支付流程
3. 完整测试微信支付流程
4. 验证订阅时间正确延长
5. 验证服务自动恢复

**完成标准**：
- [ ] 支付宝支付成功
- [ ] 微信支付成功
- [ ] 订阅时间正确
- [ ] 服务正常恢复

**依赖**：TODO-023

---

## 阶段 4：前端改造（2 周）

### Week 8: 登录注册和支付页面

#### TODO-025: 登录注册页面 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 创建 `pages/LoginPage.jsx`
2. 创建 `pages/RegisterPage.jsx`
3. 实现表单验证
4. 调用认证 API
5. 保存 JWT Token 到 localStorage
6. 登录成功跳转到 /dashboard

**完成标准**：
- [ ] 可以注册新用户
- [ ] 可以登录
- [ ] Token 正确保存
- [ ] 跳转正常

**依赖**：TODO-004

---

#### TODO-026: 支付页面 ⏳
**优先级**: P0
**预计工时**: 10 小时

**任务描述**：
1. 创建 `pages/PaymentPage.jsx`
2. 创建 `components/PaymentForm.jsx`
3. 实现套餐选择（月/季/年）
4. 实现支付方式选择（支付宝/微信）
5. 显示支付二维码或跳转链接
6. 轮询订单状态（每 2 秒）
7. 支付成功后刷新订阅信息

**完成标准**：
- [ ] 可以选择套餐
- [ ] 可以选择支付方式
- [ ] 二维码正确显示
- [ ] 轮询状态正常
- [ ] 支付成功后自动刷新

**依赖**：TODO-024

---

#### TODO-027: 订阅状态显示 ⏳
**优先级**: P0
**预计工时**: 4 小时

**任务描述**：
1. 创建 `components/SubscriptionStatus.jsx`
2. 显示订阅信息：
   - 到期时间
   - 剩余天数
   - 套餐类型（试用/月付/季付/年付）
3. 到期前 7 天显示黄色提醒
4. 到期后显示红色警告
5. 添加"续费"按钮

**完成标准**：
- [ ] 订阅信息正确显示
- [ ] 颜色提示正确
- [ ] 续费按钮跳转到支付页面

**依赖**：TODO-026

---

### Week 9: 到期提醒和账户管理

#### TODO-028: 到期提醒逻辑 ⏳
**优先级**: P1
**预计工时**: 4 小时

**任务描述**：
1. 在 App.jsx 启动时检查订阅状态
2. 已到期：
   - 显示 Modal："订阅已到期"
   - 提供"立即续费"按钮
   - 跳转到支付页面
3. 即将到期（7 天内）：
   - 顶部显示横幅提醒
   - 显示剩余天数倒计时

**完成标准**：
- [ ] 到期检测正确
- [ ] Modal 正确显示
- [ ] 横幅提醒正确
- [ ] 倒计时准确

**依赖**：TODO-027

---

#### TODO-029: 账户管理页面 ⏳
**优先级**: P1
**预计工时**: 6 小时

**任务描述**：
1. 创建 `pages/AccountPage.jsx`
2. 显示账户信息：
   - 邮箱
   - 注册时间
   - 订阅状态
3. 订单历史列表
4. 修改密码功能
5. 删除账号功能

**完成标准**：
- [ ] 账户信息正确显示
- [ ] 订单历史可查看
- [ ] 可以修改密码
- [ ] 可以删除账号

**依赖**：TODO-028

---

#### TODO-030: 前后端联调 ⏳
**优先级**: P0
**预计工时**: 6 小时

**任务描述**：
1. 测试完整用户流程：
   - 注册 → 登录 → 配对 → 使用
   - 订阅到期 → 续费 → 恢复
2. 修复发现的 Bug
3. 优化用户体验

**完成标准**：
- [ ] 完整流程无错误
- [ ] 用户体验良好
- [ ] 所有 Bug 已修复

**依赖**：TODO-029

---

## 阶段 5：测试和上线（1 周）

### Week 10: 测试和部署

#### TODO-031: 功能测试 ⏳
**优先级**: P0
**预计工时**: 8 小时

**任务描述**：
1. 测试所有核心功能：
   - 用户注册、登录
   - 服务器配对、连接
   - 事件监控、自动化
   - 支付流程
   - 订阅管理
2. 测试边界情况：
   - 订阅到期
   - 并发连接
   - 数据隔离
3. 记录测试结果

**完成标准**：
- [ ] 所有功能测试通过
- [ ] 边界情况正确处理
- [ ] 测试报告完整

**依赖**：TODO-030

---

#### TODO-032: 数据迁移演练 ⏳
**优先级**: P0
**预计工时**: 4 小时

**任务描述**：
1. 备份现有 SQLite 数据
2. 执行迁移脚本
3. 验证数据完整性
4. 测试迁移后功能
5. 演练回滚流程

**完成标准**：
- [ ] 迁移成功
- [ ] 数据完整
- [ ] 功能正常
- [ ] 回滚可用

**依赖**：TODO-018

---

#### TODO-033: 生产环境部署 ⏳
**优先级**: P0
**预计工时**: 6 小时

**任务描述**：
1. 准备生产环境配置
2. 配置环境变量
3. 部署 Docker Compose
4. 配置 Nginx 反向代理
5. 配置 SSL 证书
6. 启动应用

**完成标准**：
- [ ] 应用成功部署
- [ ] HTTPS 正常访问
- [ ] 所有服务正常运行

**依赖**：TODO-032

---

#### TODO-034: 监控和日志 ⏳
**优先级**: P1
**预计工时**: 4 小时

**任务描述**：
1. 配置日志输出
2. 添加关键指标监控：
   - 用户数量
   - 活跃连接数
   - 订单数量
   - 错误率
3. 设置告警（可选）

**完成标准**：
- [ ] 日志正常输出
- [ ] 指标可查看
- [ ] 告警配置正确（如果需要）

**依赖**：TODO-033

---

## 总计

- **总任务数**: 34 个
- **预计总工时**: 约 210 小时（10 周 × 21 小时/周）
- **P0 任务**: 24 个
- **P1 任务**: 10 个

---

## 进度追踪

**当前阶段**: 阶段 2 - 核心功能重构
**当前任务**: TODO-012 WebSocket 房间隔离
**已完成**: 11/34
**进行中**: 0/34
**待开始**: 23/34

**完成任务列表**：
- ✅ TODO-001: Docker Compose 环境搭建
- ✅ TODO-002: Prisma Schema 设计
- ✅ TODO-003: 用户注册 API
- ✅ TODO-004: 用户登录 API
- ✅ TODO-005: JWT 认证中间件
- ✅ TODO-006: 数据库多租户改造（部分完成，pairing/proxy 待定）
- ✅ TODO-007: GlobalServiceManager 实现
- ✅ TODO-008: UserServiceManager 基础实现
- ✅ TODO-009: RustPlusManager 用户隔离
- ✅ TODO-010: FCMManager 用户隔离
- ✅ TODO-011: WebSocket 认证

**更新时间**: 2026-01-03 15:50

---

## 使用说明

1. **开始任务时**：将状态改为 🚧
2. **完成任务时**：将状态改为 ✅，并勾选所有完成标准
3. **遇到问题时**：在任务下方添加注释说明
4. **调整计划时**：更新任务描述和工时估算

---

**最后更新**: 2026-01-03
