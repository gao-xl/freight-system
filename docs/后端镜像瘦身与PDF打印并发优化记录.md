# 后端镜像瘦身与 PDF 打印并发优化记录

> 版本：v1.0
> 定位：记录 2026-08-12 对后端 PDF 打印功能的并发保护、结果缓存，以及镜像瘦身（去 Chromium）的改动、决策与验证结果。
> 关联：见《文档总览索引.md》；承接《技术栈缺陷与改造清单.md》中 D1 PDF 渲染相关项；操作涉及服务器 `8.219.251.148`（`freight-system` 源码目录 `/opt/freight/freight-system`）。

---

## 1. 背景与问题

- **后端镜像过大**：`freight-system-backend:prod` 镜像达 **2.33GB**（压缩后 614MB），其中含 chromium 无头浏览器的 `apk add` 层高达 **896MB**，是镜像体积的最大来源。
- **低配服务器压力**：服务器为 2 核 1G 内存，PDF 打印默认走 chromium 渲染，单次峰值内存 200-300MB。多用户同时打印时 chromium 内存叠加，有 OOM 风险。
- **Node 单线程阻塞**：`toPdf` 是同步渲染，一个打印请求会独占 Node 线程直到渲染完成。

## 2. 关键决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 打印渲染器 | 服务器固定 `PDF_RENDERER=pdfkit` | 去 Chromium 后镜像减半；pdfkit 仍能出中文 PDF（保留 `font-noto-cjk` 字体，版式降级） |
| 是否保留 Chromium | 服务器移除，本地/大内存环境可保留 | chromium 是镜像体积与内存峰值根因；pdfkit 足够内部单证使用 |
| 并发控制 | 引入信号量，默认并发 1 | 防止多用户同时打印时内存叠加 |
| 结果缓存 | 引入带 TTL 的内存缓存，默认 60s | 同一单据重复打印复用结果，降低渲染与查库压力 |

> 前端可行性：交互式单张打印本可放前端（`window.print()`/pdfmake），但单证需**批量、入库、随邮件发送**，后端必须保留 PDF 生成能力，故采用"后端 pdfkit + 并发保护 + 缓存"方案。

## 3. 代码改动

### 3.1 新增 `backend/src/utils/semaphore.js`
通用并发信号量，限制同时执行的重型任务数量（如 chromium PDF 渲染）。超出限额的调用排队等待，不阻塞其它接口。

### 3.2 `backend/src/config/index.js`
`pdf` 配置新增两项：

| 配置 | 环境变量 | 默认 | 说明 |
|---|---|---|---|
| `maxConcurrency` | `PDF_MAX_CONCURRENCY` | `1` | 并发渲染上限，防 Chromium 内存叠加 OOM |
| `cacheTtl` | `PDF_CACHE_TTL` | `60` | 渲染结果缓存秒数；`0` 关闭缓存 |

### 3.3 `backend/src/services/printService.js`
- 引入 `pdfSemaphore`，`render()` 整体包进信号量，并发限流。
- 引入 `pdfCache`（`cacheKey`/`cacheGet`/`cacheSet`），按 `templateId + docType + bizId + opts` 哈希为 key，TTL 内重复打印直接复用。
- 原渲染逻辑未改动，仅在外层包裹。

## 4. 服务器落地（Dockerfile 瘦身）

在原 `backend/Dockerfile` 基础上修改（备份已留 `Dockerfile.bak.`）：

- 移除 chromium 无头浏览器（`apk add` 中删除 `chromium`，删除 `chromium-browser` 软链与 `PDF_BROWSER_PATH` 环境变量）。
- 保留 `font-noto-cjk` 中文字体（pdfkit 渲染中文必需）。
- 修复移除 chromium 后遗留的悬空反斜杠（`apk add` 行尾 `\`）。

`.env` 追加：

```bash
# PDF 渲染：pdfkit 轻量渲染，去 Chromium 瘦身（低配服务器）
PDF_RENDERER=pdfkit
PDF_MAX_CONCURRENCY=1
```

## 5. 部署步骤

```bash
# 1. 同步代码（semaphore.js / config/index.js / printService.js）
# 2. 修改 backend/Dockerfile（去 chromium）
# 3. .env 追加 PDF_RENDERER=pdfkit / PDF_MAX_CONCURRENCY=1
cd /opt/freight/freight-system
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

## 6. 验证结果

| 验证项 | 结果 |
|---|---|
| 镜像体积 | 2.33GB → **1.21GB**（压缩 614MB → 294MB），**降幅约 48-52%** |
| 容器状态 | `freight-backend` `Up (healthy)` |
| 健康检查 | `/api/health` 返回 HTTP 200 |
| 渲染配置 | `renderer=pdfkit maxConcurrency=1 cacheTtl=60` |
| 浏览器探测 | `findBrowser=null`，确认 chromium 已移除 |
| 中文字体 | `/usr/share/fonts/noto/NotoSansCJK-Regular.ttc` 存在，pdfkit 中文渲染正常 |
| 调度/备份/通知 | 全部正常启动 |

## 7. 注意事项与回退

- **版式降级**：pdfkit 是轻量渲染，只保留文字内容，表格/图片版式不如 chromium 完整。如对正式单证版式要求高，可权衡恢复 chromium。
- **缓存一致性**：缓存 key 不含业务数据变化，同一单据在 `PDF_CACHE_TTL` 内**数据刚被改就打印可能拿到旧版**。财务对账等要求实时的场景，建议 `PDF_CACHE_TTL=0` 关闭缓存。
- **回退方案**：Dockerfile 备份为 `Dockerfile.bak.`；如需恢复 chromium，改回该文件并设 `PDF_RENDERER=chromium`。

## 8. 后续建议

- 交互式打印（人肉点开单张）可考虑前移前端 `window.print()`，把后端额度留给"必须入库/归档/发邮件"的单据。
- 批量打印（若后续引入）应做成异步队列 + 单次限量，避免同步串行渲染拖慢其它接口。
- 前端 `freight-frontend` 镜像尚未构建，可按 `docker-compose.prod.yml` build 补齐。