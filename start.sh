#!/bin/bash

# LoopMarshal 启动脚本
# 同时启动前端和后端

set -e

echo "🚀 启动 LoopMarshal..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查依赖
echo -e "${BLUE}📦 检查依赖...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  安装依赖...${NC}"
    pnpm install
fi

# 检查前端依赖
if [ ! -d "apps/web/node_modules" ]; then
    echo -e "${YELLOW}⚠️  安装前端依赖...${NC}"
    cd apps/web && pnpm install && cd ../..
fi

echo -e "${GREEN}✅ 依赖检查完成${NC}"
echo ""

# 启动后端
echo -e "${BLUE}🔧 启动后端服务...${NC}"
cd apps/cli
pnpm dev &
BACKEND_PID=$!
cd ../..

# 等待后端启动
echo -e "${YELLOW}⏳ 等待后端服务启动...${NC}"
sleep 3

# 启动前端
echo -e "${BLUE}🎨 启动前端服务...${NC}"
cd apps/web
pnpm dev &
FRONTEND_PID=$!
cd ../..

echo ""
echo -e "${GREEN}✅ LoopMarshal 启动成功！${NC}"
echo ""
echo -e "${BLUE}📱 前端地址:${NC} http://localhost:5173"
echo -e "${BLUE}🔌 后端地址:${NC} http://127.0.0.1:42688"
echo -e "${BLUE}🔗 WebSocket:${NC} ws://127.0.0.1:42688"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"

# 捕获退出信号
trap "echo -e '\n${RED}🛑 停止服务...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

# 等待进程
wait
