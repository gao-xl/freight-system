# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 构建阶段：vite 在 devDependencies 里，这里不能加 --omit=dev
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 运行阶段：只保留 dist 静态产物，由 nginx 托管并反代 /api 到后端容器
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
