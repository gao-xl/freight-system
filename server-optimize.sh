#!/usr/bin/env bash
# ===========================================================================
# 阿里云服务器（2核 / 1G）一键优化脚本
# 用法：在服务器上以 root 执行
#   sudo bash server-optimize.sh
# 幂等：重复执行安全，不会重复建 swap / 重复写相同配置。
# 作用：
#   1. 若无 swap 则创建 2G swapfile（1G 内存机器的关键安全网，兜底 chromium 打印峰值）
#   2. 调低 vm.swappiness 等内核参数，减少无谓换页、保留内存给页面缓存
#   3. 配置 Docker 日志轮转（json-file max-size），防止 /var/lib/docker 日志写满磁盘
#   4. 打印优化前后内存/磁盘对照，便于确认生效
# ===========================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "必须用 root 运行：sudo bash $0"
  exit 1
fi

echo "==================== 优化前 ===================="
free -h
echo "---- 磁盘 ----"
df -h /

# ---------- 1. 创建 swap（不存在才创建） ----------
SWAP_SIZE=${SWAP_SIZE:-2G}
if ! swapon --show | grep -q '^/swapfile'; then
  echo "[1/4] 创建 $SWAP_SIZE swapfile ..."
  fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  # 持久化到 fstab（用 UUID 不依赖路径）
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "已启用 swapfile"
else
  echo "[1/4] swapfile 已存在，跳过"
fi

# ---------- 2. 调内核参数 ----------
echo "[2/4] 写入内核参数 ..."
cat > /etc/sysctl.d/99-freight-optimize.conf <<'EOF'
# 1G 内存服务器：宁可多用点内存做缓存，也不频繁换页
vm.swappiness=10
# 保留更多页面缓存（I/O 友好），不急于回收
vm.vfs_cache_pressure=50
# 单机低并发，允许一定程度的 overcommit，避免偶发并发时分配失败
vm.overcommit_memory=1
# 提升 TCP 连接/文件描述符上限，支撑并发与海量小文件
net.core.somaxconn=1024
net.ipv4.ip_local_port_range=1024 65000
net.ipv4.tcp_fin_timeout=30
net.ipv4.tcp_tw_reuse=1
fs.file-max=100000
EOF
sysctl --system >/dev/null || sysctl -p /etc/sysctl.d/99-freight-optimize.conf >/dev/null
echo "内核参数已生效"

# ---------- 3. Docker 日志轮转 ----------
echo "[3/4] 配置 Docker 日志轮转 ..."
if [ -d /etc/docker ]; then
  # 保留已有配置，合并 max-size / max-file
  if [ -f /etc/docker/daemon.json ]; then
    echo "检测到已有 /etc/docker/daemon.json，请手动确认其中不含 log-opts 冲突项；"
    echo "或参照下面追加："
  else
    cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "data-root": "/var/lib/docker"
}
EOF
    echo "已写入 /etc/docker/daemon.json（重启 docker 后对所有新容器生效）"
  fi
  echo "提示：如改动了 daemon.json，请执行：systemctl restart docker"
else
  echo "未发现 /etc/docker 目录，跳过"
fi

# ---------- 4. 清理无用镜像 + 对照 ----------
echo "[4/4] 清理无用 Docker 镜像 ..."
docker image prune -f >/dev/null 2>&1 && echo "已清理" || echo "docker 未运行或无需清理"

echo "==================== 优化后 ===================="
free -h
echo "---- swap UUID ----"
blkid /swapfile 2>/dev/null || true
echo "---- 完成！建议：docker compose up -d --build 重建镜像后生效 ----"