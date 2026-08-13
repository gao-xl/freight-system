#!/bin/sh
set -e

# 宿主机挂进来的 data/uploads/logs 属主通常是宿主机用户，容器内 node 用户(uid 1000)
# 未必对得上，直接以 node 身份启动会在写库时报 EACCES。这里先以 root 修正属主再降权，
# 避免使用者第一次 docker compose up 就撞上权限报错。
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/uploads /app/logs /app/backups
  chown -R node:node /app/data /app/uploads /app/logs /app/backups 2>/dev/null || true
  # 引导：启动前先做幂等初始化（确保数据库存在 → 迁移 → RBAC/基准汇率预置）。
  # 与 server.js 的自动迁移互补：本步骤负责「建库 + 预置」，保证外部 PG（如 1Panel）
  # 未建库时也能直接拉起；幂等设计，可反复执行、绝不 force 清库。
  # 用环境变量 BOOTSTRAP_ON_START=0 可关闭（例如已有外部 cron/编排接管初始化）。
  if [ "${BOOTSTRAP_ON_START:-1}" != "0" ]; then
    echo "[ENTRYPOINT] 运行 bootstrap init-db（幂等建库/迁移/预置）..."
    su-exec node node scripts/bootstrap.js init-db
  fi
  exec su-exec node "$@"
fi

exec "$@"