# Docker 部署

一键部署：前端 Nginx + 后端 Node + PostgreSQL，`docker compose up` 自动拉起全部服务。

## 首次部署检查清单（AC-21 / ADR-007）

部署前先跑一次环境检查（无需 Docker，Node 即可）：

```bash
cd backend
node scripts/check-env.js
```

脚本逐项输出 ✅/❌ 与中文修复指引，与下表一一对应：

| # | 检查项 | 要求 | 修复指引 |
|---|--------|------|----------|
| 1 | Node 运行时 | >= 18 | 安装 Node LTS：https://nodejs.org |
| 2 | Docker 已安装且守护进程运行 | `docker info` 成功 | Windows 用 Docker Desktop；Linux `sudo systemctl start docker` |
| 3 | docker compose | `docker compose version` 可用 | 升级 Docker 至 compose v2，或安装 docker-compose-plugin |
| 4 | 端口空闲 | 3000 / 5175 / 8080 未被占用 | `netstat -ano \| findstr <端口>` / `lsof -i :<端口>` 停掉占用进程 |
| 5 | 磁盘剩余 | >= 5GB | `df -h` 查看并清理 |
| 6 | 内存 | >= 2GB（PostgreSQL 最低要求） | 为服务器/虚拟机分配至少 2GB |
| 7 | .env 与 JWT_SECRET | .env 存在且 JWT_SECRET >= 64 字符 | `cp backend/.env.example backend/.env`，`openssl rand -hex 32` 生成密钥填入 |
| 8 | 时区 | 建议 Asia/Shanghai | `sudo timedatectl set-timezone Asia/Shanghai`，compose 中设 `TZ=Asia/Shanghai` |

全部通过后按下方「快速启动」三步曲部署；存在失败项按指引修复后重跑脚本。

## 快速启动

```bash
docker compose up -d --build
```

| 项 | 值 |
|----|-----|
| 访问地址 | `http://localhost:8080` |
| 默认账号 | `admin / 123456`（**上线前必须改密**） |
| 数据库 | PostgreSQL（`pg-data` 命名卷持久化） |

## 多架构 / 多平台支持

系统镜像原生支持 **x86_64(amd64)** 与 **ARM64**，可运行于 **Linux** 与 **Windows（Docker Desktop）**。

### 平台矩阵

| 宿主平台 | 架构 | 运行方式 | 基础镜像 |
|----------|------|----------|----------|
| Linux（Intel/AMD） | amd64 | docker compose | node:22-alpine / nginx:alpine / postgres:16-alpine |
| Linux（ARM，如树莓派、华为云鲲鹏） | arm64 | docker compose | 同上（官方多架构清单） |
| macOS（Apple Silicon） | arm64 | docker compose | 同上 |
| Windows（Docker Desktop + WSL2） | amd64 / arm64 | docker compose（Linux 容器） | 同上 |

> 三个基础镜像均为官方多架构清单，`docker compose up` 会自动按当前宿主机架构拉取/构建对应镜像，无需改 Dockerfile。

### 本地单平台部署（任意架构）

直接 `docker compose up -d --build` 即可，Docker 会按本机架构构建运行：

```bash
docker compose up -d --build
```

### 多架构镜像构建与分发（一次构建，多处运行）

需要同时产出 amd64 + arm64 镜像并推送到镜像仓库时，使用仓库根目录的跨架构构建脚本（底层是 `docker buildx bake` + `docker-bake.hcl`）：

```bash
# Linux / macOS
./build.sh --push                      # 构建并推送 amd64+arm64
./build.sh --platform linux/arm64      # 只构建 ARM64
IMAGE_REGISTRY=registry.example.com/ IMAGE_TAG=v1.0.0 ./build.sh --push
```

```powershell
# Windows（PowerShell）
.\build.ps1 -Push
.\build.ps1 -Platform "linux/arm64"
$env:IMAGE_REGISTRY="registry.example.com/"; $env:IMAGE_TAG="v1.0.0"; .\build.ps1 -Push
```

脚本会：
1. 校验 buildx 并自动创建/复用多平台 builder `freight-multi`（QEMU 跨架构模拟）；
2. 按 `docker-bake.hcl` 中 `PLATFORMS` 变量构建 backend + frontend 两套镜像；
3. 指定 `--push` 时推送，未指定则仅留在本地。

推送成功后，任意 x86 或 ARM 主机只需 `docker compose up -d`，Docker 会从仓库自动选中匹配架构的镜像。

### Windows 部署注意事项

- Docker Desktop 需开启 **WSL2 后端**（默认即 Linux 容器）；不要用 Windows 容器模式。
- 仓库根目录已含 `.gitattributes`，强制 `*.sh` 与 `docker-entrypoint.sh` 保持 LF 换行，避免 Windows 检出成 CRLF 导致容器内 `/bin/sh` 报 `bad interpreter`。
- 挂载卷使用相对路径（`./backend/uploads` 等），Docker Desktop 会自动映射到 WSL2 文件系统，无需改动。
- 首次使用前请先 `git pull` 并确认已按 `.gitattributes` 归一化换行（`git add --renormalize .`）。

### 强制指定运行架构（可选）

`docker-compose.yml` 中每个服务都预留了注释掉的 `platform` 示例，极端情况下可取消注释强制固定架构：

```yaml
backend:
  platform: linux/arm64
```

正常场景无需设置，Docker 会自动选择。

## 数据持久化

`docker-compose.yml` 声明：

- `pg-data` 命名卷：PostgreSQL 数据
- `backend/uploads`：上传文件
- `backend/backups`：备份输出

数据库连接参数在 `.env` 配置：

```
DB_DIALECT=postgres
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
