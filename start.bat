@echo off
chcp 65001 >nul
title 货运代理管理系统 - 启动器
echo ============================================
echo   货运代理管理系统  Freight Forwarding System
echo ============================================
echo.

cd /d "%~dp0"

REM ---------- 检查依赖 ----------
if not exist "backend\node_modules" (
  echo [1/3] 正在安装后端依赖...
  cd backend && call npm install --registry=https://registry.npmmirror.com && cd ..
)
if not exist "frontend\node_modules" (
  echo [2/3] 正在安装前端依赖...
  cd frontend && call npm install --registry=https://registry.npmmirror.com && cd ..
)
if not exist "docs-site\node_modules" (
  echo [--] 正在安装文档站依赖...
  cd docs-site && call npm install --registry=https://registry.npmmirror.com && cd ..
)

REM ---------- 构建开发文档（产物落到 backend/public/docs，随后端一起输出） ----------
echo [--] 构建开发文档...
cd docs-site && call npm run build && cd ..

REM ---------- 初始化演示数据 ----------
echo [--] 初始化 / 重置演示数据...
cd backend && call npm run seed && cd ..

echo [3/3] 启动服务...
echo.
echo   后端: http://localhost:3000
echo   前端: http://localhost:5173   (登录 admin / 123456)
echo   开发文档: http://localhost:3000/docs  (已并入后端，无独立端口)
echo.

start "freight-backend" cmd /k "cd /d %~dp0backend && npm start"
start "freight-frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo   已启动两个窗口。关闭对应窗口即可停止服务。
pause