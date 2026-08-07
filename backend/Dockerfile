# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 依赖构建阶段
# sqlite3 是原生模块，官方预编译包只覆盖 glibc，Alpine(musl) 上必须现场编译。
# 编译工具链只留在本阶段，产物 node_modules 直接拷进运行阶段，最终镜像不含 gcc。
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
    DB_STORAGE=./data/freight.db \
    TZ=Asia/Shanghai

# tini    以 PID 1 接管信号，docker stop 能真正优雅停服而不是被 SIGKILL
# su-exec 入口脚本修好挂载卷属主后降权到 node 用户运行
# tzdata  预警时间、审计日志要按本地时区记录，Alpine 默认只有 UTC
RUN apk add --no-cache tini su-exec tzdata

COPY --from=deps /app/node_modules ./node_modules

COPY package.json .sequelizerc ./
COPY config ./config
COPY migrations ./migrations
COPY scripts ./scripts
COPY src ./src

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
