# Docker 部署

一键部署：前端 Nginx + 后端 Node + PostgreSQL，`docker compose up` 自动拉起全部服务。

## 首次部署检查清单（AC-21 / ADR-007）

部署前先跑一次环境检查（无需 Docker，Node 即可）：

```bash
cd backend
node scripts/check-env.js
```

脚本逐项输出 ✅/❌ 与中文修复指引，与下表一一对应：

| # | 检查项 | 要求 | 修复指引 |
|---|--------|------|----------|
| 1 | Node 运行时 | >= 18 | 安装 Node LTS：https://nodejs.org |
| 2 | Docker 已安装且守护进程运行 | `docker info` 成功 | Windows 用 Docker Desktop；Linux `sudo systemctl start docker` |
| 3 | docker compose | `docker compose version` 可用 | 升级 Docker 至 compose v2，或安装 docker-compose-plugin |
| 4 | 端口空闲 | 3000 / 5175 / 8080 未被占用 | `netstat -ano \| findstr <端口>` / `lsof -i :<端口>` 停掉占用进程 |
| 5 | 磁盘剩余 | >= 5GB | `df -h` 查看并清理 |
| 6 | 内存 | >= 2GB（PostgreSQL 最低要求） | 为服务器/虚拟机分配至少 2GB |
| 7 | .env 与 JWT_SECRET | .env 存在且 JWT_SECRET >= 64 字符 | `cp backend/.env.example backend/.env`，`openssl rand -hex 32` 生成密钥填入 |
| 8 | 时区 | 建议 Asia/Shanghai | `sudo timedatectl set-timezone Asia/Shanghai`，compose 中设 `TZ=Asia/Shanghai` |

全部通过后按下方「快速启动」三步曲部署；存在失败项按指引修复后重跑脚本。

## 快速启动

```bash
docker compose up -d --build
```

| 项 | 值 |
|----|-----|
| 访问地址 | `http://localhost:8080` |
| 默认账号 | `admin / 123456`（**上线前必须改密**） |
| 数据库 | PostgreSQL（`pg-data` 命名卷持久化） |

## 数据持久化

`docker-compose.yml` 声明：

- `pg-data` 命名卷：PostgreSQL 数据
- `backend/uploads`：上传文件
- `backend/backups`：备份输出

数据库连接参数在 `.env` 配置：

```
DB_DIALECT=postgres
DB_NAME=freight
DB_USER=freight
DB_PASSWORD=<强密码>
```

## 健康检查与日志

```bash
docker compose ps          # STATUS 应显示 healthy
docker compose logs -f backend
curl http://localhost:8080/api/health   # {"status":"up"}
```

## 升级

```bash
git pull
docker compose up -d --build
# 若数据库结构有迁移，进入后端容器执行：
docker compose exec backend node -e "require('./src/migrate')"
```
