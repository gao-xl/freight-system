# 备份恢复

OPC 没有运维，丢数据即死——所以备份是一等公民。

## 一键备份

```bash
cd backend
node scripts/backup.js             # 打包 db + uploads + .env 为单个 tar.gz
node scripts/backup.js --cron      # 定时模式（按周保留 N 份，默认 7 份）
node scripts/backup.js --keep 30   # 自定义保留份数
```

产物在 `backend/backups/freight-backup-YYYYMMDD-HHmmss.tar.gz`。

## 恢复

```bash
node scripts/restore.js <备份文件>          # 预检 + 快照当前数据 + 替换
node scripts/restore.js <备份文件> --dry-run  # 只预检不执行
```

恢复前自动对当前数据做快照（`backups/snapshot-*`），可回退。

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
# 应包含 data/freight.db、uploads/、.env
```
