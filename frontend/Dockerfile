# 前端 Dockerfile - 多阶段构建
# 阶段 1: 构建阶段
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 设置构建参数
ARG VITE_API_URL=http://localhost:3001/api
ARG VITE_SOCKET_URL=http://localhost:3001

# 创建 .env.production 文件
RUN echo "VITE_API_URL=${VITE_API_URL}" > .env.production && \
    echo "VITE_SOCKET_URL=${VITE_SOCKET_URL}" >> .env.production

# 构建生产版本
RUN npm run build

# 阶段 2: 生产运行阶段
FROM registry.cn-hangzhou.aliyuncs.com/library/nginx:alpine

# 复制构建产物到 nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 3002

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
