#!/bin/bash

# Docker 一键启动脚本

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐳 Rust+ Bot Docker 启动脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未安装 Docker"
    echo "请访问 https://docs.docker.com/get-docker/ 安装 Docker"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ 错误: 未安装 Docker Compose"
    echo "请访问 https://docs.docker.com/compose/install/ 安装 Docker Compose"
    exit 1
fi

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
docker-compose down 2>/dev/null || true
echo ""

# 构建镜像
echo "🔨 构建 Docker 镜像..."
docker-compose build
echo "✅ 镜像构建完成"
echo ""

# 启动服务
echo "🚀 启动服务..."
docker-compose up -d
echo ""

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 服务状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose ps
echo ""

# 健康检查
echo "🏥 健康检查..."
echo ""

# 检查后端
if curl -f http://localhost:3001/api/health &> /dev/null; then
    echo "✅ 后端服务正常 (http://localhost:3001)"
else
    echo "⚠️  后端服务可能未就绪，请稍后检查"
fi

# 检查前端
if curl -f http://localhost:3002 &> /dev/null; then
    echo "✅ 前端服务正常 (http://localhost:3002)"
else
    echo "⚠️  前端服务可能未就绪，请稍后检查"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "访问地址:"
echo "  前端: http://localhost:3002"
echo "  后端: http://localhost:3001/api"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""
echo "详细文档请查看: DOCKER.md"
echo ""
