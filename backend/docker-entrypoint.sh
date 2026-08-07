#!/bin/sh
set -e

# 宿主机挂进来的 data/uploads/logs 属主通常是宿主机用户，容器内 node 用户(uid 1000)
# 未必对得上，直接以 node 身份启动会在写库时报 EACCES。这里先以 root 修正属主再降权，
# 避免使用者第一次 docker compose up 就撞上权限报错。
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/uploads /app/logs /app/backups
  chown -R node:node /app/data /app/uploads /app/logs /app/backups 2>/dev/null || true
  exec su-exec node "$@"
fi

exec "$@"
