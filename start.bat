@echo off
chcp 65001 >nul

echo 🚀 启动 LoopMarshal...
echo.

REM 检查依赖
echo 📦 检查依赖...
if not exist "node_modules" (
    echo ⚠️  安装依赖...
    call pnpm install
)

if not exist "apps\web\node_modules" (
    echo ⚠️  安装前端依赖...
    cd apps\web
    call pnpm install
    cd ..\..
)

echo ✅ 依赖检查完成
echo.

REM 启动后端
echo 🔧 启动后端服务...
start "LoopMarshal Backend" cmd /k "cd apps\cli && pnpm dev"

REM 等待后端启动
echo ⏳ 等待后端服务启动...
timeout /t 3 /nobreak >nul

REM 启动前端
echo 🎨 启动前端服务...
start "LoopMarshal Frontend" cmd /k "cd apps\web && pnpm dev"

echo.
echo ✅ LoopMarshal 启动成功！
echo.
echo 📱 前端地址: http://localhost:5173
echo 🔌 后端地址: http://127.0.0.1:42688
echo 🔗 WebSocket: ws://127.0.0.1:42688
echo.
echo 按任意键退出此窗口（服务将继续运行）
pause >nul
