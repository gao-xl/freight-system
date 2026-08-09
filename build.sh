#!/usr/bin/env bash
# ===========================================================================
# 货运代理管理系统 - 多架构镜像构建脚本（Linux / macOS）
#
# 支持平台：x86_64(amd64) / ARM64(arm64) / Linux / Windows(Docker Desktop)
#
# 用法（在 freight-system 根目录运行）：
#   ./build.sh                          # 按当前宿主机架构本地构建并加载
#   ./build.sh --push                   # 构建 amd64+arm64 并推送（需设 IMAGE_REGISTRY）
#   ./build.sh --platform linux/amd64   # 只构建 x86_64
#   ./build.sh --platform linux/arm64   # 只构建 ARM64
#   ./build.sh --tag v1.0.0 --push
#
# 推送前需设置环境变量 IMAGE_REGISTRY（含结尾 /），例如：
#   IMAGE_REGISTRY=registry.example.com/ ./build.sh --push
#
# 说明：
#   - 不带 --push 时，只按当前宿主机架构构建并 --load 进本地 docker，
#     随后 docker compose up -d --build 即可使用。
#   - 带 --push 时，用 docker-container builder 一次性产出多架构镜像并推送，
#     任意 x86/ARM 主机 docker compose 都会自动选中匹配架构。
# ===========================================================================
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
PUSH=""
PLATFORMS=""
BAKE_FLAGS=""

usage() {
  cat <<'EOF'
用法: ./build.sh [选项]
选项:
  --push                构建并推送多架构镜像（需先设置 IMAGE_REGISTRY 环境变量）
  --platform <列表>     目标架构，逗号分隔；不传时按 push 与否自动选择
  --tag <tag>           镜像标签，默认 latest
  -h, --help            显示本帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH="--push"; shift ;;
    --platform) PLATFORMS="$2"; shift 2 ;;
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

if ! docker buildx version >/dev/null 2>&1; then
  echo "错误：需要 Docker buildx（Docker 20.10+ / Desktop 自带）" >&2
  exit 1
fi

if [[ -n "$PUSH" ]]; then
  # 多架构分发：默认 amd64+arm64，必须指定镜像仓库才能推送
  [[ -z "$PLATFORMS" ]] && PLATFORMS="linux/amd64,linux/arm64"
  if [[ -z "$IMAGE_REGISTRY" ]]; then
    echo "错误：--push 需先设置 IMAGE_REGISTRY 环境变量（如 registry.example.com/）" >&2
    exit 1
  fi
  BAKE_FLAGS="--push"
else
  # 本地构建：默认按当前宿主机架构，构建后 --load 进本地 docker
  if [[ -z "$PLATFORMS" ]]; then
    case "$(docker info --format '{{.Architecture}}')" in
      aarch64|arm64) PLATFORMS="linux/arm64" ;;
      armv7l)        PLATFORMS="linux/arm/v7" ;;
      *)             PLATFORMS="linux/amd64" ;;
    esac
  fi
  BAKE_FLAGS="--load"
fi

# 创建并复用多平台 builder（docker-container 驱动；多架构需 push，单平台可用 --load 落盘）
if ! docker buildx inspect freight-multi >/dev/null 2>&1; then
  docker buildx create --name freight-multi --driver docker-container --bootstrap
fi
docker buildx use freight-multi

# docker buildx bake 会读取与 HCL 变量同名的环境变量，覆盖默认值
export PLATFORMS IMAGE_TAG IMAGE_REGISTRY

echo "==> 目标架构 : ${PLATFORMS}"
echo "==> 镜像仓库 : ${IMAGE_REGISTRY:-<本地>}"
echo "==> 镜像标签 : ${IMAGE_TAG}"
echo "==> 动作     : ${PUSH:-本地构建并加载}"

docker buildx bake --builder freight-multi $BAKE_FLAGS

echo "==> 完成。本地部署请运行: docker compose up -d --build"