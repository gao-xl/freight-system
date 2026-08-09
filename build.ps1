# ===========================================================================
# 货运代理管理系统 - 多架构镜像构建脚本（Windows PowerShell）
#
# 支持平台：x86_64(amd64) / ARM64(arm64) / Linux / Windows(Docker Desktop + WSL2)
#
# 用法（在 freight-system 根目录运行）：
#   .\build.ps1                          # 按当前宿主机架构本地构建并加载
#   .\build.ps1 -Push                    # 构建 amd64+arm64 并推送（需先设 IMAGE_REGISTRY）
#   .\build.ps1 -Platform "linux/amd64"  # 只构建 x86_64
#   .\build.ps1 -Platform "linux/arm64"  # 只构建 ARM64
#   .\build.ps1 -Tag v1.0.0 -Push
#
# 推送前需先设置环境变量 IMAGE_REGISTRY（含结尾 /）：
#   $env:IMAGE_REGISTRY="registry.example.com/"
#   .\build.ps1 -Push
#
# 说明：
#   - 不带 -Push 时，只按当前宿主机架构构建并 --load 进本地 docker，
#     随后 docker compose up -d --build 即可使用。
#   - 带 -Push 时，用 docker-container builder 一次性产出多架构镜像并推送，
#     任意 x86/ARM 主机 docker compose 都会自动选中匹配架构。
# ===========================================================================
param(
    [switch]$Push,
    [string]$Platform = "",
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"

if (-not (docker buildx version 2>$null)) {
    Write-Host "错误：需要 Docker buildx（Docker Desktop 自带）" -ForegroundColor Red
    exit 1
}

if ($Push) {
    if (-not $Platform) { $Platform = "linux/amd64,linux/arm64" }
    if (-not $env:IMAGE_REGISTRY) {
        Write-Host "错误：-Push 需先设置环境变量 IMAGE_REGISTRY（如 registry.example.com/）" -ForegroundColor Red
        exit 1
    }
    $bakeArgs = @("--builder", "freight-multi", "--push")
} else {
    if (-not $Platform) {
        # 本地构建：默认按当前宿主机架构
        switch ((docker info --format '{{.Architecture}}').Trim().ToLower()) {
            "aarch64" { $Platform = "linux/arm64" }
            "arm64"   { $Platform = "linux/arm64" }
            "armv7l"  { $Platform = "linux/arm/v7" }
            default   { $Platform = "linux/amd64" }
        }
    }
    $bakeArgs = @("--builder", "freight-multi", "--load")
}

# 创建并复用多平台 builder（docker-container 驱动；多架构需 push，单平台可用 --load 落盘）
if (-not (docker buildx inspect freight-multi 2>$null)) {
    docker buildx create --name freight-multi --driver docker-container --bootstrap
}
docker buildx use freight-multi | Out-Null

# docker buildx bake 会读取与 HCL 变量同名的环境变量，覆盖默认值
$env:PLATFORMS = $Platform
$env:IMAGE_TAG = $Tag
if (-not $env:IMAGE_REGISTRY) { $env:IMAGE_REGISTRY = "" }

$registry = if ($env:IMAGE_REGISTRY) { $env:IMAGE_REGISTRY } else { "<本地>" }
$action = if ($Push) { "构建并推送" } else { "本地构建并加载" }
Write-Host "==> 目标架构 : $Platform"
Write-Host "==> 镜像仓库 : $registry"
Write-Host "==> 镜像标签 : $Tag"
Write-Host "==> 动作     : $action"

docker buildx bake @bakeArgs

Write-Host "==> 完成。本地部署请运行: docker compose up -d --build"