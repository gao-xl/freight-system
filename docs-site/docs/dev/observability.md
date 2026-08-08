---
title: 可观测性
prev: /deploy/upgrade
next: /dev/architecture
---

# 可观测性

> 可观测性 = 日志 + 健康检查 + 备份 + 监控。本系统面向小团队、无专职运维，因此优先提供**低运维成本的保障**：结构化日志、一键备份、健康检查。

## 1. 结构化日志（winston）

后端用 `backend/src/utils/logger.js`（winston）输出结构化日志：

- 控制台 + 文件 `backend/logs/app.log`
- 文件滚动：单文件 10MB，保留 5 份
- 级别：`process.env.LOG_LEVEL || 'info'`

```js
const { logger } = require('../utils/logger');
logger.info('创建订单', { orderNo: 'SO-001', userId: req.user?.id });
logger.error('对接失败', { err: err.message, code });
```

### 日志脱敏（重要）

`logger.js` 内置 `mask()` 函数，自动隐藏 token / password / apiKey / secret / authorization / 长数字串：

```js
const { mask } = require('../utils/logger');
const safe = mask(req.headers.authorization);   // "Bearer ***"
```

**纪律**：日志里禁止输出明文密钥、密码、完整卡号。对外部对接的入参/响应，先过 `mask()` 再记录。

## 2. 健康检查

后端提供 `GET /api/health`，返回 `{ status: 'up' }`：

- Docker 部署用它做容器健康检查（`docker-compose.yml` 的 healthcheck）
- 运维 / 监控轮询用它判断服务存活

```bash
curl http://localhost:3000/api/health   # {"status":"up"}
```

## 3. 一键备份与恢复

`backend/scripts/backup.js` 把数据库、上传文件、运行配置打成单个 `.tar.gz`，**零第三方依赖**：

```bash
# 立即备份
node scripts/backup.js
# 定期备份（常驻进程，cron 表达式）
node scripts/backup.js --cron="0 2 * * *"
# 指定保留份数与输出目录
node scripts/backup.js --keep=14 --out=/mnt/nas/freight
```

恢复：`node scripts/restore.js "<备份文件>"`。

**关键设计**：

- 数据库先快照拷贝再打包，避免运行中直接读 SQLite 打出坏包
- 保留策略：默认保留 7 份，自动清理过期
- 备份内嵌 `manifest.json`（时间、文件清单、dbDialect、warnings）
- 若 `DB_DIALECT` 非 sqlite（如 PostgreSQL），脚本提示业务数据需用 `pg_dump` 另行备份

> 详细用法见 [备份恢复](/deploy/backup)。

## 4. 监控与告警（建议）

系统本身已内置业务级预警（预警中心），但**基础设施级监控**（CPU/内存/磁盘/进程存活）需结合宿主环境：

| 指标 | 建议方式 |
|------|----------|
| 服务存活 | Docker healthcheck + 外部 uptime 轮询 |
| 磁盘（备份目录） | 宿主机 crontab 或监控脚本，磁盘满会导致备份失败 |
| 备份是否成功 | 每天检查 `logs/backup.log` 或备份文件时间戳 |
| 定时任务 | 预警/自动化每 30 分钟跑，靠日志确认执行 |

> 取舍：小团队不必上一整套 Prometheus/Grafana。先保证「日志可查、健康可探、备份可恢复」三件事，成本最低、收益最大。

## 5. 二开时的可观测性纪律

- 新功能的关键路径打 `logger.info`，错误打 `logger.error`（带上下文）
- 外部对接：记录耗时、成败、脱敏后的响应摘要
- 自动化/定时任务：保留执行痕迹，便于事后排查
- 日志里绝不出现明文密钥

## 下一步

[架构与演进](/dev/architecture) —— 理解模块化/插件化/数据层的演进路线。