# 🚀 快速启动指南

本指南将帮助你快速运行 Rust+ Web Dashboard 前后端服务。

---

## 📋 前置要求

- **Node.js**: >= 18.0.0
- **MySQL**: >= 5.7 或 >= 8.0
- **npm**: 通常随 Node.js 一起安装

### 检查环境

```bash
# 检查 Node.js 版本
node -v

# 检查 npm 版本
npm -v

# 检查 MySQL 是否运行
mysql --version
```

---

## ⚡ 方式一：一键启动（推荐）

如果已完成数据库配置，可以使用一键启动脚本：

```bash
# 在项目根目录执行
./start.sh

# Windows 用户使用 Git Bash 或 WSL 运行
```

**脚本功能**：
- ✅ 自动检查并安装依赖
- ✅ 自动创建 .env 文件（如果不存在）
- ✅ 同时启动前后端服务
- ✅ 支持 Ctrl+C 优雅停止

**访问地址**：
- 前端：http://localhost:5173
- 后端：http://localhost:3000

---

## 📝 方式二：手动启动（详细步骤）

### 步骤 1: 数据库准备

#### 1.1 创建数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE rust_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 创建用户（可选，更安全）
CREATE USER 'rustbot'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON rust_dashboard.* TO 'rustbot'@'localhost';
FLUSH PRIVILEGES;

# 退出
exit;
```

#### 1.2 验证数据库

```bash
# 确认数据库已创建
mysql -u root -p -e "SHOW DATABASES LIKE 'rust_dashboard';"
```

---

### 步骤 2: 配置后端

#### 2.1 安装依赖

```bash
cd backend
npm install
```

#### 2.2 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env 文件
nano .env  # 或使用你喜欢的编辑器
```

**必须配置的环境变量**：

```bash
# 数据库连接
DATABASE_URL="mysql://root:password@localhost:3306/rust_dashboard"
# 格式: mysql://用户名:密码@主机:端口/数据库名

# JWT 密钥（必须修改！）
JWT_SECRET=your-secret-key-at-least-32-characters-long
# 生成随机密钥：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 服务器配置
PORT=3000
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info

# 管理员密码（首次部署）
ADMIN_DEFAULT_PASSWORD=admin123456
```

**可选配置**（支付功能需要）：

```bash
# 支付宝配置（可选）
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_GATEWAY=https://openapi.alipaydev.com/gateway.do
ALIPAY_NOTIFY_URL=
ALIPAY_RETURN_URL=

# 代理配置（中国大陆用户需要）
PROXY_SUBSCRIPTION_URL=
PROXY_NODE_NAME=
PROXY_PORT=10808
```

#### 2.3 运行数据库迁移

```bash
# 生成 Prisma Client
npm run prisma:generate

# 运行数据库迁移（创建表结构）
npm run prisma:migrate

# 创建默认管理员账户
node prisma/seed-admin.js
```

**预期输出**：

```
✅ 管理员账户创建成功！
   用户名: admin
   邮箱: admin@localhost
   密码: admin123456 (请尽快修改)
   订阅: 永久订阅
```

#### 2.4 验证配置

```bash
# 检查 Prisma Client 是否生成
ls node_modules/.prisma/client

# 验证数据库连接
npx prisma db pull
```

---

### 步骤 3: 启动后端服务

#### 3.1 开发模式（带热重载）

```bash
npm run dev
```

#### 3.2 生产模式

```bash
npm start
```

**成功启动标志**：

```
╔═══════════════════════════════════════╗
║   🎮 Rust+ Web Dashboard Backend    ║
║       (Multi-Tenant Architecture)    ║
║   Server: http://localhost:3000     ║
║   Status: ✅ Running                  ║
╚═══════════════════════════════════════╝

✅ 多租户服务初始化完成
   成功: 1 个用户
   失败: 0 个用户
```

#### 3.3 验证后端运行

```bash
# 健康检查
curl http://localhost:3000/api/health

# 预期返回
{"status":"ok","timestamp":1234567890,"activeUsers":1}
```

---

### 步骤 4: 配置前端

#### 4.1 安装依赖

```bash
# 在新终端窗口
cd frontend
npm install
```

#### 4.2 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env（通常不需要修改）
nano .env
```

**默认配置**：

```bash
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

---

### 步骤 5: 启动前端服务

#### 5.1 开发模式

```bash
npm run dev
```

**成功启动标志**：

```
  VITE v5.1.4  ready in 523 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

#### 5.2 构建生产版本

```bash
# 构建
npm run build

# 预览构建结果
npm run preview
```

---

## ✅ 验证运行

### 1. 访问前端

打开浏览器访问：http://localhost:5173

**预期页面**：登录/注册界面

### 2. 测试注册

1. 点击「注册」按钮
2. 填写：
   - 用户名：testuser
   - 邮箱：test@example.com
   - 密码：test123456
3. 点击「注册」
4. 预期结果：自动登录并获得 7 天免费试用

### 3. 测试 WebSocket

登录后，打开浏览器开发者工具（F12）→ Network → WS，应该看到：

```
ws://localhost:3000/socket.io/?EIO=4&transport=websocket
Status: 101 Switching Protocols
```

### 4. 测试 API

```bash
# 获取服务器列表（需要先登录获取 token）
curl -H "Authorization: Bearer <your_jwt_token>" \
     http://localhost:3000/api/servers
```

---

## 🛠️ 常见问题

### 问题 1: 端口被占用

**错误信息**：
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方法**：

```bash
# Windows
netstat -ano | findstr :3000
taskkill //F //PID <PID>

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

**或修改端口**：编辑 `backend/.env`

```bash
PORT=3001
```

### 问题 2: 数据库连接失败

**错误信息**：
```
Error: P1001: Can't reach database server at localhost:3306
```

**解决方法**：

1. 确认 MySQL 正在运行
   ```bash
   # Windows
   net start MySQL80

   # Linux
   sudo systemctl start mysql
   ```

2. 检查连接字符串
   ```bash
   # backend/.env
   DATABASE_URL="mysql://root:password@localhost:3306/rust_dashboard"
   #                    ^^^^ 用户名  ^^^^^^^^ 密码
   ```

3. 测试连接
   ```bash
   mysql -u root -p -e "SELECT 1;"
   ```

### 问题 3: Prisma Client 未生成

**错误信息**：
```
Error: @prisma/client did not initialize yet
```

**解决方法**：

```bash
cd backend
npm run prisma:generate
```

### 问题 4: 迁移失败

**错误信息**：
```
Error: Migration failed to apply cleanly
```

**解决方法**：

```bash
# 重置数据库（⚠️ 会删除所有数据）
npx prisma migrate reset

# 重新运行迁移
npm run prisma:migrate

# 重新创建管理员
node prisma/seed-admin.js
```

### 问题 5: 前端无法连接后端

**症状**：前端显示网络错误，无法登录

**解决方法**：

1. 确认后端正在运行
   ```bash
   curl http://localhost:3000/api/health
   ```

2. 检查 CORS 配置
   ```bash
   # backend/.env
   FRONTEND_URL=http://localhost:5173
   ```

3. 清除浏览器缓存，重新打开

---

## 🔍 调试技巧

### 查看后端日志

```bash
# 设置调试级别
# backend/.env
LOG_LEVEL=debug

# 重启后端
npm run dev
```

### 查看数据库内容

```bash
# 使用 Prisma Studio（图形界面）
cd backend
npm run prisma:studio

# 访问 http://localhost:5555
```

### 检查数据库表

```bash
mysql -u root -p rust_dashboard -e "SHOW TABLES;"

# 预期输出
+----------------------------+
| Tables_in_rust_dashboard   |
+----------------------------+
| _prisma_migrations         |
| devices                    |
| event_logs                 |
| notification_settings      |
| orders                     |
| proxy_config               |
| servers                    |
| subscriptions              |
| users                      |
+----------------------------+
```

---

## 📚 下一步

成功运行后，请参考：

- [首次使用指南](README.md#-首次使用) - 如何配对服务器
- [游戏内命令](docs/COMMANDS_GUIDE.md) - 所有可用命令
- [设备自动化](README.md#-智能设备自动化) - 智能设备控制
- [代理配置](docs/PROXY_SETUP.md) - 中国大陆用户必看

---

## 💡 快捷命令汇总

```bash
# 后端
cd backend
npm run dev              # 开发模式启动
npm start                # 生产模式启动
npm run prisma:studio    # 数据库可视化

# 前端
cd frontend
npm run dev              # 开发模式启动
npm run build            # 构建生产版本
npm run preview          # 预览构建结果

# 一键启动（根目录）
./start.sh               # 同时启动前后端
```

---

## 📞 获取帮助

遇到问题？

1. 查看 [常见问题](README.md#-常见问题)
2. 检查 [GitHub Issues](https://github.com/your-repo/rust-bot/issues)
3. 查看后端日志：`backend/logs/`
4. 使用 `LOG_LEVEL=debug` 获取详细日志

---

**祝使用愉快！** 🎮
