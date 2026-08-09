# 货运代理管理系统 (Freight Forwarding System)

> 面向 **OPC（一人公司）与 3-4 人小团队** 的开源货代系统。
> 核心竞争力不是功能广度，而是 **充分的二次开发能力** —— 配置 > 代码，扩展点不动核心。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 定位

- **不做**：不对标东胜 DS7/DS8、海管家的功能全覆盖。中小货代不会为"免费"放弃成熟商业软件。
- **做**：开箱即用的货代核心链路 + 干净好读的代码基座 + 插件化二开体系。
- **三条铁律**：① 稳定优先（PostgreSQL 一键部署）② 二开优先（定制 80% 靠加文件/加配置）③ 安全先行。

---

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3 · Vite · Element Plus · Pinia · Vue Router · Axios · ECharts |
| 后端 | Node.js · Express · Sequelize ORM · JWT · Helmet · 限流 |
| 数据库 | PostgreSQL 16+ |
| 鉴权 | JWT + bcrypt + RBAC 四表（角色/权限/用户-角色/角色-权限） |

---

## 架构总览

```
┌─────────────────────────── 前端 (Vue3, :5173) ───────────────────────────┐
│  经营看板 · 客户/供应商 · 订单(进出口) · 订舱 · 报关 · 单证 · 跟踪 · 财务   │
│  外部对接 · 系统管理(角色/权限/用户/小组/审计) · 客户门户 · 待办工作台       │
└───────────────────────────────────┬───────────────────────────────────────┘
                                     │  /api  (JWT Bearer)
┌─────────────────────────────────── ▼ ────────────────────────────────────┐
│  后端 (Express, :3000)                                                    │
│  ┌────────── 路由层 ──────────┐  ┌────────── 中间件 ──────────┐            │
│  │ 41 控制器 · 统一 CRUD 工厂 │  │ auth(JWT) · RBAC guard      │            │
│  │ automation · portal · task  │  │ dataScope(数据隔离) · audit │            │
│  └─────────────────────────────┘  │ validate(joi) · 限流        │            │
│  ┌────────── 业务服务 ─────────┐  └─────────────────────────────┘            │
│  │ alertService(规则引擎)       │  ┌────────── 二开扩展点 ────────┐          │
│  │ automationService(动作引擎)  │  │ 事件总线 · 自定义字段         │          │
│  │ alertScheduler(30min cron)   │  │ ModuleRegistry(插件协议)     │          │
│  │ printService · fileExtract   │  │ 适配器协议(send/query)       │          │
│  └─────────────────────────────┘  └─────────────────────────────┘          │
│  ┌────────── 数据层 ───────────┐  ┌────────── 外部对接 ──────────┐          │
│  │ 47 模型 · Sequelize ORM     │  │ 12 适配器: 船期/汇率/港口/   │          │
│  │ 迁移(migrations) + 种子(seed)│  │ 报关/AIS/场站/运价/美元支付  │          │
│  └─────────────────────────────┘  └─────────────────────────────┘          │
└───────────────────────────────────────────────────────────────────────────┘
                                     │
                              PostgreSQL
```

---

## 模块地图（实测规模）

| 领域 | 规模 | 说明 |
| --- | --- | --- |
| 数据模型 | 47 张表 | 订单为中枢，订舱/报关/单证/跟踪/财务/发票/放单/预警/EDI/收款全 `belongsTo(Order)` |
| 后端控制器 | 41 个 | 通用 CRUD 工厂 + 业务控制器 |
| 外部适配器 | 12 个 | shipSchedule · exchangeRate · port(含沪/甬/青) · customs · aisTracking · yardQingdao · freightRate · finance · usdPay |
| 前端视图 | 46 个 | 含客户门户、待办工作台、系统管理 |
| 自动化 | 规则引擎 + 动作引擎 | 5 条预警规则 + 自动推进节点/自动生成应收，幂等去重，30 分钟 cron + 启动即跑 |

---

## 快速启动

```bash
# 后端
cd backend
npm install
cp ../.env.example ../.env        # 生成配置（开发环境可不动）
npm run seed                      # 首次初始化：建表 + 演示数据
npm run dev                       # 启动 http://localhost:3000

# 前端（另开终端）
cd frontend
npm install
npm run dev                       # 访问 http://localhost:5173 （已代理 /api → 3000）
```

### 默认账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| admin | 123456 | 系统管理员 |
| manager | 123456 | 经理 |
| operator | 123456 | 操作员 |
| finance | 123456 | 财务 |

> 演示数据含客户、订单、订舱、财务等种子记录，开箱即可体验全流程。

---

## 数据库：两条路径

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 全新部署 / 开发重置 | `npm run seed` | force sync 建表 + 演示数据，**会清库**，仅首次用 |
| 版本升级（保留数据） | `npm run db:migrate` | 增量迁移，生产/有真实数据时**只能用这个** |

- 系统仅支持 PostgreSQL：`.env` 填 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`（已内置 `pg` 驱动）。

---

## 二次开发入口

扩展点分三级，详见 [`docs/二开指南.md`](docs/二开指南.md)：

```
定制诉求 ──►  配置级（Web UI 配置，零代码）
              · 自定义字段 CustomField        [已实现]
              · 业务规则 BusinessRule         [已实现]
              · 流程配置 WorkflowConfig       [已实现]
              · 打印模板 PrintTemplate        [已实现]
             ─────────────────────────────
            文件级（加一个文件/函数）
              · CRUD 模块（crudController 工厂）   [已实现]
              · 对接适配器（send/query 协议）       [已实现]
              · 预警规则函数 / 自动化动作函数       [已实现]
              · 事件监听 events.on(...)            [已实现]
             ─────────────────────────────
            插件级（独立包，可启用/卸载）
              · ModuleRegistry 协议               [已实现]
```

**最快上手**：新增一个对接只需在 `backend/src/integrations/adapters/` 放一个导出 `{code,name,send,query}` 的文件，即被工厂自动注册，无需改任何业务代码。

---

## 安全

- JWT 密钥生产环境强制环境变量，缺失拒绝启动；开发环境一次性随机。
- Helmet 安全头 + CORS 白名单 + 全局/登录限流。
- 文件上传扩展名白名单 + 路径穿越校验 + 字段保护黑名单。
- bcrypt 密码加密 + 操作审计日志 + RBAC 细粒度权限。
- 完整安全设计见 [`docs/安全设计.md`](docs/安全设计.md)。

---

## 部署

- **前端**：`cd frontend && npm run build`，产物在 `frontend/dist/`，交 Nginx 托管并代理 `/api`。
- **后端**：`node src/server.js`，可用 `pm2` 守护；生产务必设 `NODE_ENV=production` 与 `JWT_SECRET`。
- **Docker 一键部署**：`docker compose up -d`（内置 PostgreSQL 服务，自动拉起）。
- **部署前检查（AC-21）**：`cd backend && node scripts/check-env.js`，逐项核对 Node / Docker / 端口 / 磁盘 / 内存 / .env 密钥，详见文档站部署文档。
- **备份 / 恢复（AC-22）**：`cd backend && npm run backup`（归档到 `backend/backups/`，保留最近 7 份），恢复用 `npm run restore`；系统管理页亦可在线备份 / 恢复。

---

## 新手引导与帮助中心（onboarding）

首次部署后登录 admin（默认 `123456`，首登强制改密），系统按数据空态自动进入引导：

- **6 步快速开始向导** `/onboarding`：公司信息 → 币种 → 示例数据 → 安全设置 → 使用偏好 → 完成；可跳过，完成 / 跳过标记存于本地。
- **空状态引导**：客户 / 报价 / 订单等核心页面数据为空时给出就近引导（录报价 / 录客户 / 生成示例数据）。
- **帮助中心**：页面右上角帮助入口，含字段说明与术语词典（`frontend/src/assets/glossary.json`）。
- **示例数据管理**：系统管理 → 示例数据，一键生成 / 清空演示数据（事务 + isDemo 批次；非空库拒绝生成以保护真实数据）。
- **系统健康**：系统管理 → 系统健康，聚合 Node / 磁盘 / 端口 / 数据目录 / 数据库 / 迁移六项检查（`GET /api/system/health`）。
- **备份与恢复**：系统管理 → 备份恢复，在线打包 / 下载 / 恢复（`POST /api/system/backup`、`POST /api/system/restore`）。

后端模块：`onboardingController` / `demoDataService` / `healthCheck` / `backupController` / `backupRestoreService`，路由注册见 `backend/src/routes/index.js`（`/api/onboarding/*`、`/api/system/health`、`/api/system/backup`）。

---

## 环境变量

完整列表见 [`.env.example`](.env.example)，关键项：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境 | development |
| `JWT_SECRET` | JWT 密钥（生产必填） | 开发随机生成 |
| `DB_DIALECT` | 数据库方言（仅 postgres） | postgres |
| `DB_HOST` | PostgreSQL 主机 | 127.0.0.1 |
| `DB_NAME` | PostgreSQL 库名 | freight |
| `CORS_ORIGIN` | 跨域白名单（逗号分隔） | localhost:5173 |
| `RATE_LIMIT_LOGIN_MAX` | 登录限流次数/15min | 20 |

---

## 文档

- **文档站**（VitePress）：`cd docs-site && npm install && npm run build`，构建产物输出到 `backend/public/docs/`，后端启动后访问 `/docs`（Docker 部署已并入后端镜像，无独立端口）。
- [`docs/文档总览索引.md`](docs/文档总览索引.md) — 全部规划文档索引
- [`docs/项目设计方案.md`](docs/项目设计方案.md) — 总体设计
- [`docs/二开指南.md`](docs/二开指南.md) — 二次开发实战
- [`docs/二次开发扩展空间设计.md`](docs/二次开发扩展空间设计.md) — 扩展点设计
- [`docs/安全设计.md`](docs/安全设计.md) — 安全方案
- [`docs/开源升级方案-OPC小团队二开版.md`](docs/开源升级方案-OPC小团队二开版.md) — 升级总纲
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — 贡献指南

---

## License

[MIT](LICENSE) © freight-system contributors
