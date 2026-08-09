# 备份恢复

OPC 没有运维，丢数据即死——所以备份是一等公民。

## 一键备份

```bash
cd backend
node scripts/backup.js             # 打包 PostgreSQL 业务库 + uploads + .env 为单个 tar.gz
node scripts/backup.js --keep 30   # 自定义保留份数（默认 7）
node scripts/backup.js --cron      # 定时模式（按周保留 N 份）
```

产物在 `backend/backups/freight-backup-YYYYMMDD-HHmmss.tar.gz`。

备份默认包含业务库（`pg/dump.pg_dump`，pg_dump custom 格式），因此"备份成功"即含订单/财务/审计等全部业务数据。pg_dump 失败会中止备份，避免产出不含业务数据的误导性备份。

数据库转储需要 PostgreSQL 客户端（`pg_dump`/`pg_restore`）。Docker 镜像已内置；本机直跑若缺，请安装客户端，或用 `--no-pg` 显式跳过数据库（仅特殊场景，业务数据不备份）。

## 恢复

```bash
node scripts/restore.js <备份文件>            # 预检 + 快照当前数据 + 还原文件与业务库
node scripts/restore.js <备份文件> --dry-run  # 只预检不执行
node scripts/restore.js <备份文件> --no-pg    # 跳过数据库还原，只还原文件/配置
```

归档含 `pg/dump.pg_dump` 时默认用 `pg_restore` 还原业务库（`--clean --if-exists` 清空重建），交互确认后执行。恢复前自动对当前数据做快照（`backups/freight-prerestore-*`），可回退。

## 定时备份（cron）

```bash
# Linux/macOS
0 2 * * * cd /path/to/freight-system/backend && node scripts/backup.js --cron

# Windows 计划任务
schtasks /create /tn "freight-backup" /tr "node C:\path\backend\scripts\backup.js --cron" /sc daily /st 02:00
```

## 验证备份

```bash
tar -tzf backend/backups/freight-backup-*.tar.gz   # 查看包内容
# 应包含 manifest.json、pg/dump.pg_dump、uploads/、.env

# 校验数据库转储可读（不落库）
pg_restore --list <(tar -xzOf backend/backups/freight-backup-*.tar.gz pg/dump.pg_dump) | head
```

## Docker 部署

镜像内置 PostgreSQL 客户端，直接执行：

```bash
docker compose exec backend npm run backup     # 立即备份（含业务库）
docker compose exec backend npm run restore -- <备份文件> --yes
```