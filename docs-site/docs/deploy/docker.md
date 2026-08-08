# Docker 部署

零运维优先：单容器（前端 Nginx + 后端 Node + SQLite），一条命令跑起来。

## 快速启动

```bash
docker compose up -d --build
```

| 项 | 值 |
|----|-----|
| 访问地址 | `http://localhost:8080` |
| 默认账号 | `admin / 123456`（**上线前必须改密**） |
| 数据目录 | `backend/data/`（SQLite 文件 + uploads） |

## 数据持久化

`docker-compose.yml` 声明了 4 个卷：

- `backend/data`：数据库 + 上传文件
- `backend/.env`：环境变量
- `backend/backups`：备份输出

## PostgreSQL profile（多并发团队）

```bash
docker compose --profile pg up -d
```

需在 `.env` 配置：

```
DB_DIALECT=postgres
DB_HOST=db
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
