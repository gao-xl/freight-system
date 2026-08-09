# ===========================================================================
# 货运代理管理系统 - 多架构镜像构建配置（docker buildx bake）
#
# 支持平台：x86_64(amd64) / ARM64(arm64)，可扩展 386 / arm/v7
# 跨系统：Linux、macOS、Windows（Docker Desktop + WSL2）
#
# 用法（在 freight-system 根目录）：
#   构建并推送到镜像仓库（需先设 IMAGE_REGISTRY 环境变量）：
#     IMAGE_REGISTRY=registry.example.com/ docker buildx bake --push
#   只构建某一架构：
#     PLATFORMS=linux/arm64 docker buildx bake backend
#   说明：docker-container builder 下，不带 --push 的 bake 产物只留在构建缓存，
#     不会进入本地 docker；本地直接用 docker compose up -d --build 即可。
#   统一入口建议用 build.sh（Linux/macOS）或 build.ps1（Windows），
#   它们会自动创建/复用名为 freight-multi 的多平台 builder，
#   并按是否需要推送自动选择 --push（多架构）或 --load（本地单架构）。
#
# 变量说明（均可通过同名环境变量覆盖）：
#   IMAGE_REGISTRY  镜像仓库前缀，含结尾斜杠；留空则只产出本地镜像
#   IMAGE_TAG       镜像标签，默认 latest
#   PLATFORMS       目标架构列表，逗号分隔
# ===========================================================================

variable "IMAGE_REGISTRY" {
  default = ""
}

variable "IMAGE_TAG" {
  default = "latest"
}

variable "PLATFORMS" {
  # 默认同时产出 x86_64 与 ARM64 两套架构镜像
  # 需要 32 位时追加 linux/386,linux/arm/v7
  default = "linux/amd64,linux/arm64"
}

group "default" {
  targets = ["backend", "frontend"]
}

target "backend" {
  context   = "backend"
  platforms = split(",", PLATFORMS)
  tags      = ["${IMAGE_REGISTRY}freight-system-backend:${IMAGE_TAG}"]
}

target "frontend" {
  context   = "frontend"
  platforms = split(",", PLATFORMS)
  tags      = ["${IMAGE_REGISTRY}freight-system-frontend:${IMAGE_TAG}"]
}