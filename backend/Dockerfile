# 后端 Dockerfile
FROM docker.m.daocloud.io/library/node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装 Python 和构建工具（better-sqlite3 需要）
RUN apk add --no-cache python3 make g++

# 复制 package.json
COPY package.json ./

# 复制本地 rustplus.js 库
COPY lib ./lib

# 安装依赖
RUN npm install --omit=dev

# 复制源代码
COPY src ./src
COPY config ./config

# 复制 xray 二进制文件
COPY bin ./bin
RUN chmod +x ./bin/xray

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3001

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 启动命令
CMD ["node", "src/app.js"]
