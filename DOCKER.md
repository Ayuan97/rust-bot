# Docker 部署指南

本项目支持使用 Docker 和 Docker Compose 进行容器化部署。

## 目录结构

```
rust-bot/
├── docker-compose.yml          # Docker Compose 配置
├── .dockerignore              # 根目录 Docker 忽略文件
├── backend/
│   ├── Dockerfile             # 后端 Dockerfile
│   └── .dockerignore          # 后端 Docker 忽略文件
└── frontend/
    ├── Dockerfile             # 前端 Dockerfile
    ├── nginx.conf             # Nginx 配置
    └── .dockerignore          # 前端 Docker 忽略文件
```

## 快速开始

### 前置要求

- Docker (>= 20.10)
- Docker Compose (>= 2.0)

### 一键启动

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**特点：**
- ✅ 数据完全在容器内部
- ✅ 每次启动都是全新环境
- ✅ 适合快速部署和测试
- ⚠️ 容器删除后数据清空（需在 Web 界面重新配置）

访问:
- **前端**: http://localhost:3002
- **后端 API**: http://localhost:3001/api
- **健康检查**: http://localhost:3001/api/health

## 详细说明

### 服务架构

本项目包含两个 Docker 服务:

1. **backend** - Node.js 后端服务
   - 端口: 3001
   - 镜像: 基于 `node:20-alpine`
   - 数据持久化: `./backend/data` 挂载到容器

2. **frontend** - Nginx 前端服务
   - 端口: 3002
   - 镜像: 基于 `nginx:alpine`
   - 采用多阶段构建优化镜像大小

### 环境变量配置

在项目根目录创建 `backend/.env` 文件:

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 前端地址（CORS）
FRONTEND_URL=http://localhost

# 其他配置...
```

### 数据说明

**数据位置：** 容器内部 `/app/data/`

**数据生命周期：**
```
容器启动 → 创建空的 /app/data 目录
         ↓
运行时   → 生成数据库文件 database.db
         → 保存 FCM 凭证
         → 保存服务器配置
         ↓
容器停止 → 数据仍在容器内
         ↓
容器删除 → ❌ 数据全部清除
```

**重要提示：**
- ⚠️ 容器删除后，所有配置和数据都会丢失
- ⚠️ FCM 凭证需要重新配置
- ⚠️ 服务器列表需要重新添加
- ✅ 适合快速测试和演示场景
- ✅ 每次启动都是干净的全新环境

## Docker Compose 命令

### 基础操作

```bash
# 构建镜像
docker-compose build

# 启动服务（后台运行）
docker-compose up -d

# 启动服务（前台运行，查看日志）
docker-compose up

# 停止服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v
```

### 查看状态

```bash
# 查看运行中的容器
docker-compose ps

# 查看日志
docker-compose logs

# 实时查看后端日志
docker-compose logs -f backend

# 实时查看前端日志
docker-compose logs -f frontend
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启单个服务
docker-compose restart backend
docker-compose restart frontend
```

### 进入容器

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh
```

## 单独构建镜像

### 后端镜像

```bash
cd backend

# 构建镜像
docker build -t rust-bot-backend:latest .

# 运行容器
docker run -d \
  --name rust-bot-backend \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  rust-bot-backend:latest
```

### 前端镜像

```bash
cd frontend

# 构建镜像
docker build -t rust-bot-frontend:latest .

# 运行容器
docker run -d \
  --name rust-bot-frontend \
  -p 80:80 \
  rust-bot-frontend:latest
```

## 生产环境部署

### 1. 修改端口映射

编辑 `docker-compose.yml`:

```yaml
services:
  backend:
    ports:
      - "3000:3000"  # 改为其他端口，如 "8080:3000"

  frontend:
    ports:
      - "80:80"      # 改为其他端口，如 "8081:80"
```

### 2. 配置环境变量

```bash
# 创建生产环境配置
cp backend/.env.example backend/.env

# 编辑配置
vim backend/.env
```

### 3. 使用 HTTPS

推荐使用 Nginx 反向代理 + Let's Encrypt SSL:

```nginx
# /etc/nginx/sites-available/rust-bot
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4. 资源限制

添加资源限制到 `docker-compose.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  frontend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M
```

## 健康检查

Docker Compose 已配置健康检查:

```bash
# 查看健康状态
docker-compose ps

# 手动检查后端健康
curl http://localhost:3000/api/health

# 手动检查前端健康
curl http://localhost
```

## 数据备份（可选）

如果需要保存容器内的数据，可以手动导出：

```bash
# 从运行中的容器复制数据库
docker cp rust-bot-backend:/app/data/database.db ./backup-database.db

# 恢复数据到新容器
docker cp ./backup-database.db rust-bot-backend:/app/data/database.db
docker-compose restart backend
```

**注意：** 通常不需要备份，因为每次启动都是全新环境。

## 日志管理

### 查看日志

```bash
# 查看最近 100 行日志
docker-compose logs --tail=100

# 查看最近 1 小时的日志
docker-compose logs --since 1h

# 导出日志到文件
docker-compose logs > logs.txt
```

### 日志轮转

编辑 `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

重启 Docker:

```bash
sudo systemctl restart docker
```

## 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker-compose logs backend

# 检查容器状态
docker-compose ps

# 重新构建镜像
docker-compose build --no-cache
docker-compose up -d
```

### 数据库权限问题

```bash
# 修复权限
sudo chown -R 1000:1000 backend/data
chmod -R 755 backend/data
```

### 端口冲突

```bash
# 查看端口占用
sudo lsof -i :3000
sudo lsof -i :80

# 修改 docker-compose.yml 端口映射
```

### 网络问题

```bash
# 重建网络
docker-compose down
docker network prune
docker-compose up -d
```

## 更新升级

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose build
docker-compose up -d

# 查看日志确认正常
docker-compose logs -f
```

## 性能优化

### 1. 使用 BuildKit

```bash
# 启用 Docker BuildKit
export DOCKER_BUILDKIT=1

# 构建镜像
docker-compose build
```

### 2. 多阶段构建缓存

前端 Dockerfile 已使用多阶段构建，可显著减小镜像大小:

- 构建阶段: 使用 Node.js 完整镜像
- 运行阶段: 使用精简的 Nginx Alpine 镜像

### 3. 镜像分层优化

- 依赖安装与代码复制分离
- 先复制 package.json，后复制源代码
- 利用 Docker 层缓存加速构建

## 安全建议

1. **不要在镜像中包含敏感信息**
   - 使用 `.dockerignore` 排除 `.env` 文件
   - 使用环境变量或 Docker secrets

2. **定期更新基础镜像**
   ```bash
   docker-compose pull
   docker-compose build --no-cache
   ```

3. **使用非 root 用户运行**（可选优化）

4. **限制容器权限**
   ```yaml
   services:
     backend:
       cap_drop:
         - ALL
       cap_add:
         - NET_BIND_SERVICE
   ```

## 监控与日志

### 使用 Portainer

```bash
docker run -d \
  -p 9000:9000 \
  --name portainer \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce
```

访问: http://localhost:9000

### 使用 ctop 监控

```bash
# 安装 ctop
docker run --rm -ti \
  --name=ctop \
  -v /var/run/docker.sock:/var/run/docker.sock \
  quay.io/vektorlab/ctop:latest
```

## 常见问题

### Q: 如何重置所有数据？

```bash
docker-compose down -v
rm -rf backend/data/*
docker-compose up -d
```

### Q: 如何查看容器内部文件？

```bash
docker-compose exec backend ls -la /app
docker-compose exec frontend ls -la /usr/share/nginx/html
```

### Q: 如何修改 Nginx 配置？

```bash
# 编辑 frontend/nginx.conf
vim frontend/nginx.conf

# 重新构建并启动
docker-compose build frontend
docker-compose up -d frontend
```

### Q: 如何在局域网访问？

修改 `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "0.0.0.0:80:80"  # 监听所有网卡
  backend:
    environment:
      - FRONTEND_URL=http://your-server-ip
```

## 技术支持

如有问题，请查阅:
- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- 项目 GitHub Issues

---

**提示**: 首次启动可能需要几分钟来构建镜像和安装依赖，请耐心等待。
