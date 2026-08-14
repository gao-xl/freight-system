#!/usr/bin/env bash
# ===========================================================================
# 货运系统运维部署脚本：配置 crontab（每日备份 + 宕机告警）与 .env 运维键
# ===========================================================================
# 用法（在服务器上以 root 执行）：
#   sudo bash deploy-ops.sh --sync-dir /mnt/nas/freight-backup
#       异地同步到本地挂载目录（NAS / NFS / 对象存储挂载点）
#   sudo bash deploy-ops.sh --sync-rsync user@backup-host:/backups/freight
#       异地同步到 rsync 远程主机
#   sudo bash deploy-ops.sh --health-url http://127.0.0.1:3001/api/health
#       自定义健康检查地址（默认自动按 BACKEND_PORT 推断）
#   sudo bash deploy-ops.sh --dry-run --sync-dir /mnt/nas/freight-backup
#       只预览将执行的动作，不落盘
#   sudo bash deploy-ops.sh --remove
#       移除 crontab 运维条目与 .env 运维键
#   sudo bash deploy-ops.sh --force --sync-dir /mnt/nas/freight-backup
#       强制覆盖 .env 中已存在的运维键（默认只补缺省、不覆盖已有值）
#
# 幂等：重复执行安全。crontab 用标记块管理，不会重复堆积。
# 通知渠道复用 .env 的 SMTP_* / WECHAT_WEBHOOK / WEBHOOK_URL，无需在此配置。
# ===========================================================================
set -euo pipefail

# ---------- 参数 ----------
SYNC_DIR=""
SYNC_RSYNC=""
HEALTH_URL=""
DRY_RUN=0
REMOVE=0
FORCE=0

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --sync-dir)    SYNC_DIR="$2"; shift 2 ;;
    --sync-rsync)  SYNC_RSYNC="$2"; shift 2 ;;
    --health-url)  HEALTH_URL="$2"; shift 2 ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --remove)      REMOVE=1; shift ;;
    --force)       FORCE=1; shift ;;
    --help|-h)     usage; exit 0 ;;
    *) echo "未知参数: $1"; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ] && [ "$DRY_RUN" -ne 1 ]; then
  echo "必须用 root 运行：sudo bash $0（--dry-run 预览无需 root）"
  exit 1
fi

# ---------- 定位项目目录 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
BACKEND_DIR="$REPO_ROOT/backend"

if [ ! -d "$BACKEND_DIR/scripts" ]; then
  echo "未找到 $BACKEND_DIR/scripts，请确认脚本放在项目根目录（与 docker-compose.yml 同级）"
  exit 1
fi

# .env 位置：优先 backend/.env（运维脚本 notify.js 的 loadEnv 第一候选），否则项目根 .env
ENV_FILE=""
if [ -f "$BACKEND_DIR/.env" ]; then ENV_FILE="$BACKEND_DIR/.env"; fi
if [ -z "$ENV_FILE" ] && [ -f "$REPO_ROOT/.env" ]; then ENV_FILE="$REPO_ROOT/.env"; fi
if [ -z "$ENV_FILE" ]; then ENV_FILE="$BACKEND_DIR/.env"; fi

CRON_BEGIN="# === freight-ops begin ==="
CRON_END="# === freight-ops end ==="

# ---------- 工具函数 ----------
log() { echo "$*"; }

# 幂等写入 .env 键：已存在且非空则跳过（除非 --force），否则写入
upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local cur
    cur="$(grep "^${key}=" "$file" | head -1 | cut -d= -f2- || true)"
    if [ -n "$cur" ] && [ "$FORCE" -ne 1 ]; then
      log "  跳过 ${key}（已配置: ${cur}）"
      return 0
    fi
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    log "  更新 ${key}=${val}"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
    log "  写入 ${key}=${val}"
  fi
}

# 移除 .env 中的运维键
remove_env_keys() {
  local file="$1"
  for key in OPS_BACKUP_KEEP OPS_SYNC_DIR OPS_SYNC_RSYNC OPS_HEALTH_URL OPS_HEALTH_FAIL_THRESHOLD OPS_ALERT_COOLDOWN_MIN; do
    if grep -q "^${key}=" "$file" 2>/dev/null; then
      sed -i "/^${key}=/d" "$file"
      log "  移除 ${key}"
    fi
  done
}

# 安装 crontab 块（幂等：先删旧块再写新块）
install_crontab() {
  local tmp_old tmp_new
  tmp_old="$(mktemp)"; tmp_new="$(mktemp)"
  crontab -l > "$tmp_old" 2>/dev/null || true
  awk -v b="$CRON_BEGIN" -v e="$CRON_END" '
    $0==b { skip=1 }
    skip==0 { print }
    $0==e { skip=0 }
  ' "$tmp_old" > "$tmp_new"
  {
    echo "$CRON_BEGIN"
    echo "# 每日 02:00 备份 + 异地同步（ops-daily）"
    echo "0 2 * * * cd ${BACKEND_DIR} && node scripts/ops-daily.js >> logs/ops-daily.log 2>&1"
    echo "# 每 5 分钟宕机探测（ops-healthcheck）"
    echo "*/5 * * * * cd ${BACKEND_DIR} && node scripts/ops-healthcheck.js >> logs/ops-healthcheck.log 2>&1"
    echo "$CRON_END"
  } >> "$tmp_new"
  crontab "$tmp_new"
  rm -f "$tmp_old" "$tmp_new"
}

# 移除 crontab 块
remove_crontab() {
  local tmp_old tmp_new
  tmp_old="$(mktemp)"; tmp_new="$(mktemp)"
  crontab -l > "$tmp_old" 2>/dev/null || true
  awk -v b="$CRON_BEGIN" -v e="$CRON_END" '
    $0==b { skip=1 }
    skip==0 { print }
    $0==e { skip=0 }
  ' "$tmp_old" > "$tmp_new"
  crontab "$tmp_new"
  rm -f "$tmp_old" "$tmp_new"
}

# ---------- 推断健康检查地址 ----------
if [ -z "$HEALTH_URL" ] && [ -f "$ENV_FILE" ]; then
  local_bp="$(grep -E '^BACKEND_PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
  local_bp="${local_bp:-3001}"
  HEALTH_URL="http://127.0.0.1:${local_bp}/api/health"
fi
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"

# ---------- 校验 ----------
if [ -n "$SYNC_DIR" ] && [ -n "$SYNC_RSYNC" ]; then
  echo "错误：--sync-dir 与 --sync-rsync 只能二选一"
  exit 1
fi

echo "==================== 部署预览 ===================="
log "项目根目录 : $REPO_ROOT"
log "后端目录   : $BACKEND_DIR"
log ".env 文件  : $ENV_FILE"
log "健康检查   : $HEALTH_URL"
if [ -n "$SYNC_DIR" ]; then log "异地同步   : 目录 ${SYNC_DIR}"; fi
if [ -n "$SYNC_RSYNC" ]; then log "异地同步   : rsync ${SYNC_RSYNC}"; fi
if [ -z "$SYNC_DIR" ] && [ -z "$SYNC_RSYNC" ]; then log "异地同步   : 未配置（仅本地备份，建议补 --sync-dir / --sync-rsync）"; fi
echo "=================================================="

if [ "$REMOVE" -eq 1 ]; then
  log "[移除] crontab 运维条目 ..."
  remove_crontab
  log "[移除] .env 运维键 ..."
  remove_env_keys "$ENV_FILE"
  log "完成。已移除 crontab 与 .env 运维配置。"
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "[DRY-RUN] 以上为将执行的动作，未做任何修改。"
  exit 0
fi

# ---------- 1. 确保 backend/logs 目录存在 ----------
mkdir -p "$BACKEND_DIR/logs"

# ---------- 2. 写入 .env 运维键 ----------
log "[1/3] 写入 .env 运维配置（$ENV_FILE）..."
upsert_env OPS_BACKUP_KEEP "14" "$ENV_FILE"
upsert_env OPS_HEALTH_URL "$HEALTH_URL" "$ENV_FILE"
upsert_env OPS_HEALTH_FAIL_THRESHOLD "3" "$ENV_FILE"
upsert_env OPS_ALERT_COOLDOWN_MIN "30" "$ENV_FILE"
if [ -n "$SYNC_DIR" ]; then
  upsert_env OPS_SYNC_DIR "$SYNC_DIR" "$ENV_FILE"
fi
if [ -n "$SYNC_RSYNC" ]; then
  upsert_env OPS_SYNC_RSYNC "$SYNC_RSYNC" "$ENV_FILE"
fi

# ---------- 3. 安装 crontab ----------
log "[2/3] 安装 crontab 运维条目 ..."
install_crontab
log "  已写入：每日 02:00 备份 + 异地同步；每 5 分钟宕机探测"

# ---------- 4. 验证 ----------
log "[3/3] 验证 ..."
echo "---- 当前 crontab 运维条目 ----"
crontab -l 2>/dev/null | sed -n "/${CRON_BEGIN}/,/${CRON_END}/p" || echo "（未找到，请检查）"
echo "---- 建议手动验证 ----"
echo "  cd $BACKEND_DIR && node scripts/ops-healthcheck.js   # 立即探测一次"
echo "  cd $BACKEND_DIR && node scripts/ops-daily.js --dry-run  # 预览备份动作"
echo "完成。通知渠道复用 .env 的 SMTP_* / WECHAT_WEBHOOK / WEBHOOK_URL，无需额外配置。"
