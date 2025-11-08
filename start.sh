#!/bin/bash

echo "================================"
echo "Rust+ Web Dashboard 启动脚本"
echo "================================"
echo ""

# 检查是否安装了依赖
if [ ! -d "backend/node_modules" ]; then
  echo "❌ 后端依赖未安装，正在安装..."
  cd backend && npm install && cd ..
  echo "✅ 后端依赖安装完成"
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "❌ 前端依赖未安装，正在安装..."
  cd frontend && npm install && cd ..
  echo "✅ 前端依赖安装完成"
fi

# 检查环境变量文件
if [ ! -f "backend/.env" ]; then
  echo "⚠️  未找到 backend/.env 文件，从示例创建..."
  cp backend/.env.example backend/.env
  echo "✅ 已创建 backend/.env，请根据需要修改"
fi

if [ ! -f "frontend/.env" ]; then
  echo "⚠️  未找到 frontend/.env 文件，从示例创建..."
  cp frontend/.env.example frontend/.env
  echo "✅ 已创建 frontend/.env"
fi

echo ""
echo "🚀 启动服务..."
echo ""

# 使用 trap 捕获 Ctrl+C
trap 'echo ""; echo "🛑 正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT TERM

# 启动后端（自动清理端口）
echo "▶️  启动后端服务..."
cd backend && ./dev.sh &
BACKEND_PID=$!

# 等待2秒
sleep 2

# 启动前端
echo "▶️  启动前端服务..."
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 服务已启动！"
echo ""
echo "📱 访问地址："
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 等待进程
wait
