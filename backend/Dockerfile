# syntax=docker/dockerfile:1

# ===========================================================================
# 后端镜像（多架构）
#   - 基础镜像 node:22-alpine 官方清单同时覆盖 amd64(x86_64) / arm64 等架构，
#     无需按平台拆 Dockerfile。
#   - 每一层 apk / npm 都在目标架构下执行，天然适配 x86 与 ARM；
#     跨架构一次构建见仓库根目录 docker-bake.hcl（build.sh / build.ps1 封装）。
#   - Windows 宿主机请用 Docker Desktop + WSL2（跑 Linux 容器），
#     挂载卷使用相对路径即可，无需改动本文件。
# ===========================================================================

# ---------------------------------------------------------------------------
# 依赖构建阶段
# pg 是纯 JS 驱动，无需现场编译；gcc/make/python 仅用于个别可选原生模块的构建，
# 编译工具链只留在本阶段，产物 node_modules 直接拷进运行阶段，最终镜像不含 gcc。
# 跨架构（如 x86 构建 arm64）时编译在目标架构模拟环境下完成，产物与本机无关。
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------------------
# 运行阶段
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_DIALECT=postgres \
    DB_HOST=pg \
    DB_PORT=5432 \
    TZ=Asia/Shanghai \
    PDF_BROWSER_PATH=/usr/bin/chromium-browser

# tini    以 PID 1 接管信号，docker stop 能真正优雅停服而不是被 SIGKILL
# su-exec 入口脚本修好挂载卷属主后降权到 node 用户运行
# tzdata  预警时间、审计日志要按本地时区记录，Alpine 默认只有 UTC
# chromium + font-noto-cjk：D1 PDF 渲染（puppeteer-core 无头浏览器），
#   Alpine 默认无中文字体，不装 CJK 字体 PDF 中文会缺字形；
#   chromium 在容器内需 --no-sandbox（pdfRenderer args 已带）
RUN apk add --no-cache tini su-exec tzdata chromium font-noto-cjk \
    && ln -sf /usr/bin/chromium-browser /usr/local/bin/chromium

COPY --from=deps /app/node_modules ./node_modules

COPY package.json .sequelizerc ./
COPY config ./config
COPY migrations ./migrations
COPY scripts ./scripts
COPY src ./src
# 开发文档构建产物（docs-site 构建后落地到 public/docs），随镜像一并发布
COPY public ./public

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p data uploads logs backups \
    && chown -R node:node /app

EXPOSE 3000

# 复用后端已有的 /api/health 端点。Node 22 自带 fetch，不用额外装 curl/wget。
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
