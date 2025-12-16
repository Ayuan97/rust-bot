#!/bin/bash

# Docker 一键启动脚本

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐳 Rust+ Bot Docker 启动脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "📝 创建配置文件 .env ..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件"
    echo ""
fi

# 读取端口配置
source .env
BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3002}

echo "📋 当前配置："
echo "  后端端口: $BACKEND_PORT"
echo "  前端端口: $FRONTEND_PORT"
echo ""
echo "💡 提示: 修改端口请编辑 .env 文件"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未安装 Docker"
    echo "请访问 https://docs.docker.com/get-docker/ 安装 Docker"
    exit 1
fi

# 检测 Docker Compose 命令格式
DOCKER_COMPOSE=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ 错误: 未安装 Docker Compose"
    echo "请访问 https://docs.docker.com/compose/install/ 安装 Docker Compose"
    exit 1
fi

echo "📦 使用命令: $DOCKER_COMPOSE"

# 检查 Docker 是否运行
if ! docker info &> /dev/null; then
    echo "❌ 错误: Docker 未运行"
    echo "请启动 Docker 服务"
    exit 1
fi

echo "✅ Docker 环境检查通过"
echo ""


# 停止旧容器（如果存在）
echo "🛑 停止旧容器..."
$DOCKER_COMPOSE down 2>/dev/null || true
echo ""

# 构建镜像
echo "🔨 构建 Docker 镜像..."
$DOCKER_COMPOSE build
echo "✅ 镜像构建完成"
echo ""

# 启动服务
echo "🚀 启动服务..."
$DOCKER_COMPOSE up -d
echo ""

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 服务状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
$DOCKER_COMPOSE ps
echo ""

# 健康检查
echo "🏥 健康检查..."
echo ""

# 检查后端
if curl -f http://localhost:$BACKEND_PORT/api/health &> /dev/null; then
    echo "✅ 后端服务正常 (http://localhost:$BACKEND_PORT)"
else
    echo "⚠️  后端服务可能未就绪，请稍后检查"
fi

# 检查前端
if curl -f http://localhost:$FRONTEND_PORT &> /dev/null; then
    echo "✅ 前端服务正常 (http://localhost:$FRONTEND_PORT)"
else
    echo "⚠️  前端服务可能未就绪，请稍后检查"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "访问地址:"
echo "  前端: http://localhost:$FRONTEND_PORT"
echo "  后端: http://localhost:$BACKEND_PORT/api"
echo ""
echo "常用命令:"
echo "  查看日志: $DOCKER_COMPOSE logs -f"
echo "  停止服务: $DOCKER_COMPOSE down"
echo "  重启服务: $DOCKER_COMPOSE restart"
echo ""
echo "💡 修改端口: 编辑 .env 文件，然后重新运行此脚本"
echo ""
