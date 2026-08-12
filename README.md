# 货运代理管理系统（Freight Forwarding System）

> 面向 **OPC（一人公司）与 3-4 人小团队** 的开源货代系统。
> 核心竞争力不是功能广度，而是 **充分的二次开发能力** —— 配置 > 代码，扩展点不动核心。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 目录

- [一、项目定位与三条铁律](#一定位与三条铁律)
- [二、技术栈](#二技术栈)
- [三、架构总览](#三架构总览)
- [四、模块地图](#四模块地图)
- [五、快速上手（入门篇）](#五快速上手入门篇)
- [六、使用教程（按模块）](#六使用教程按模块)
- [七、API 使用教程（每个接口怎么调）](#七api-使用教程每个接口怎么调)
- [八、二次开发（进阶篇：从入门到精通）](#八二次开发进阶篇从入门到精通)
- [九、部署与运维](#九部署与运维)
- [十、安全](#十安全)
- [十一、环境变量](#十一环境变量)
- [十二、参考文档](#十二参考文档)

---

## 一、定位与三条铁律

- **不做**：不做面向大型货代的全功能覆盖。中小货代不会为"免费"放弃成熟商业软件。
- **做**：开箱即用的货代核心链路 + 干净好读的代码基座 + 插件化二开体系。
- **三条铁律**：① 稳定优先（PostgreSQL 一键部署）② 二开优先（定制 80% 靠加文件/加配置）③ 安全先行。

---

## 二、技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3 · Vite · Element Plus · Pinia · Vue Router · Axios · ECharts |
| 后端 | Node.js（≥22）· Express · Sequelize ORM · JWT · Helmet · 限流 |
| 数据库 | PostgreSQL 16+（**仅支持 PostgreSQL**，已内置 `pg` 驱动） |
| 鉴权 | JWT + bcrypt + RBAC 四表（角色/权限/用户-角色/角色-权限） |
| 二开机制 | 事件总线 · 自定义字段 · 模块注册表（ModuleRegistry）· 适配器协议 |

---

## 三、架构总览

```
┌─────────────────────────── 前端 (Vue3, dev:5173) ───────────────────────────┐
│  待办工作台 · 经营看板 · 客户/供应商 · 订单(进出口) · 订舱 · 报关 · 单证 · 跟踪 │
│  财务 · 发票 · 报价 · 预警 · 场站 · 外部数据 · AI · 外部对接 · 系统管理 · 客户门户│
└───────────────────────────────────┬───────────────────────────────────────┘
                                     │  /api  (JWT Bearer / X-API-Key)
┌─────────────────────────────────── ▼ ──────────────────────────────────────┐
│  后端 (Express, :3000)                                                      │
│  ┌────────── 路由层 ──────────┐  ┌────────── 中间件(顺序) ─────────┐          │
│  │ 41 控制器 · 统一 CRUD 工厂  │  │ helmet → cors → json → observability│      │
│  │ 模块注册表挂载额外路由       │  │ → rateLimit → loginLimiter → audit   │      │
│  └─────────────────────────────┘  │ → authRequired → dataScope → 业务路由│     │
│  ┌────────── 业务服务 ─────────┐  └────────────────────────────────────  │      │
│  │ alertService(预警规则引擎)    │  ┌────────── 二开扩展点 ─────────┐        │
│  │ automationService(动作引擎)  │  │ 事件总线 eventBus · 自定义字段   │        │
│  │ workflowService(状态机)      │  │ ModuleRegistry(插件协议)        │        │
│  │ printService · fileExtract   │  │ 适配器协议(send/query)          │        │
│  └─────────────────────────────┘  └────────────────────────────────┘        │
│  ┌────────── 数据层 ───────────┐  ┌────────── 外部对接 ──────────┐           │
│  │ 54 模型 · Sequelize ORM     │  │ 13 适配器: 船期/汇率/港口/报关/ │          │
│  │ 迁移(migrations) + 种子(seed)│  │ AIS/场站/运价/美元支付/AI对话   │          │
│  └─────────────────────────────┘  └─────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                              PostgreSQL
```

代码依赖方向（架构契约）：`controllers → services/dataAccess → models`，控制器禁止直接 `require('../models')`。

---

## 四、模块地图（实测规模）

| 领域 | 规模 | 说明 |
| --- | --- | --- |
| 数据模型 | 54 张表 | 订单为中枢，订舱/报关/单证/跟踪/财务/发票/放单/预警/EDI/收款全 `belongsTo(Order)` |
| 后端控制器 | 41 个 | 通用 CRUD 工厂 + 业务控制器 |
| 外部适配器 | 13 个 | shipSchedule · exchangeRate · port(含沪/甬/青) · customs · aisTracking · yardQingdao · freightRate · finance · usdPay · aiChat |
| 前端视图 | 46 个 | 含客户门户、待办工作台、系统管理 |
| 自动化 | 规则引擎 + 动作引擎 | 5 条预警规则 + 自动推进节点/自动生成应收，幂等去重，30 分钟 cron + 启动即跑 |

---

## 五、快速上手（入门篇）

### 5.1 环境准备

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 22 | 前后端均需要 |
| PostgreSQL | 16+ | 系统仅支持 PostgreSQL |
| npm | 随 Node | 包管理 |

### 5.2 一键启动（本地开发）

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

### 5.3 默认账号

| 账号 | 密码 | 角色 | 说明 |
| --- | --- | --- | --- |
| admin | 123456 | 系统管理员 | 首次登录强制改密 |
| manager | 123456 | 经理 | |
| operator | 123456 | 操作员 | |
| finance | 123456 | 财务 | |

> 演示数据含客户、订单、订舱、财务等种子记录，开箱即可体验全流程。

### 5.4 数据库：两条路径

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 全新部署 / 开发重置 | `npm run seed` | force sync 建表 + 演示数据，**会清库**，仅首次用 |
| 版本升级（保留数据） | `npm run db:migrate` | 增量迁移，生产/有真实数据时**只能用这个** |

`.env` 填 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`。

### 5.5 首次登录引导（onboarding）

首次部署后登录 admin，系统按数据空态自动进入引导：

- **6 步快速开始向导** `/onboarding`：公司信息 → 币种 → 示例数据 → 安全设置 → 使用偏好 → 完成；可跳过。
- **空状态引导**：客户 / 报价 / 订单等核心页面数据为空时给出就近引导。
- **帮助中心**：页面右上角帮助入口，含字段说明与术语词典。
- **示例数据管理**：系统管理 → 示例数据，一键生成 / 清空演示数据（有真实数据时拒绝生成以保护数据）。
- **系统健康**：系统管理 → 系统健康，聚合 Node / 磁盘 / 端口 / 数据目录 / 数据库 / 迁移六项检查。

---

## 六、使用教程（按模块）

> 每个模块说明三件事：**它是什么**、**在哪个页面操作**、**对应哪些 API**。所有页面路径均在登录后侧边栏菜单中。

### 6.1 待办工作台 / 消息中心 / 经营看板（工作台）

| 模块 | 是什么 | 页面 | 关键 API |
| --- | --- | --- | --- |
| 待办工作台 | 聚合各业务模块的待办：超期应收、临期截港、待订舱、待报关、待跟进、青岛港卡点 | `/tasks` | `GET /api/tasks/todo` |
| 消息中心 | 站内消息，配合 SSE 实时推送更新角标 | `/messages` | `GET /api/messages`、`GET /api/messages/unread-count` |
| 经营看板 | 按角色展示高频入口、今日待办、经营数据概览 | `/dashboard` | `GET /api/dashboard` 及 8 个子端点 |

### 6.2 客户 / 供应商

| 模块 | 是什么 | 页面 | 关键操作 |
| --- | --- | --- | --- |
| 客户管理 | 客户档案 + 360° 视图（订单/财务/信用/发票/报价/跟进）+ 多联系人 + 跟进记录 + 附件 + Excel 批量导入 | `/customers` | 新建（编号自动生成 CUS）、跟进、导入、删除后进回收站可恢复 |
| 供应商管理 | 供应商/承运商档案 + 批量导入 | `/suppliers` | 新建（编号 SUP）、导入、回收站恢复 |

### 6.3 订单（核心中枢）

订单是系统中枢，支持**进出口分离**（页面 `/orders?type=export` 出口操作、`/orders?type=import` 进口操作）。

| 能力 | 说明 | 关键 API |
| --- | --- | --- |
| 订单 CRUD | 新建（编号 SO）、编辑（乐观锁）、删除（软删）、批量操作 | `/api/orders` |
| 一单多箱 | 一个订单管理多个箱号 | `/api/orders/:orderId/containers` |
| 流程节点 | 业务节点流转视图，手动推进节点 | `/api/orders/:id/flow`、`/api/orders/:id/advance` |
| 时间线 | 完整时间线（含风险等级标记） | `/api/orders/:id/timeline` |
| 单票毛利 | 成本/毛利/利润汇总 | `/api/orders/:id/profit` |
| 放单控制 | 结清自动通过，否则待审批 | `/api/orders/:id/release` |
| Excel 导出 | 复用列表筛选，导出 = 所见 | `/api/orders/export` |

### 6.4 订舱 / 报关 / 单证 / 运输跟踪（业务链路）

| 模块 | 是什么 | 页面 | 关键 API |
| --- | --- | --- | --- |
| 订舱管理 | 订舱单（编号 BK） | `/bookings` | `/api/bookings` |
| 报关管理 | 报关单（编号 DC） | `/customs` | `/api/customs` |
| 单证管理 | 提单/装箱单/发票/原产地证等，支持一键生成、全文搜索、状态流转、附件上传下载 | `/documents` | `GET /api/documents/generate`、`GET /api/documents/search` |
| 运输跟踪 | 货物跟踪节点（按 eventTime 倒序） | `/tracking` | `/api/tracks` |

### 6.5 财务与发票

财务模块受 `periodGuard` 锁账保护，已结账/锁账期间禁止写操作。

| 能力 | 说明 | 关键 API |
| --- | --- | --- |
| 费用流水 | 应收/应付，多币种，支持批量建费、批量核销 | `/api/finance` |
| 收款/付款单 | 收款核销 `{customerId, direction, amount, financeIds}` | `/api/finance/payments` |
| 红字冲销 | 差错冲销（原单保留） | `/api/finance/:id/reverse` |
| 发票管理 | 从费用生成发票（AR/AP 自动发号）、批量开票、作废、数电票 | `/api/finance/invoices` |
| 对账单 | 按客户+月份生成对账单 PDF | `/api/finance/statement` |
| 账期/结账 | 结账、锁账、反结账（需 reason） | `/api/finance/periods/:code/close` 等 |
| AR 账龄 | 未开票/0-30/31-60/61+/已结算 | `/api/finance/aging` |

### 6.6 报价 / 运价库

| 模块 | 是什么 | 页面 | 关键操作 |
| --- | --- | --- | --- |
| 报价询价 | 报价单（编号 QT）→ 发送 → 客户确认 → 转订单 | `/quotations` | 非草稿/取消不可删；`POST /api/quotations/:id/convert-order` |
| 运价库 | 本地运价小库，支持检索、比价（按承运商取最优）、智能推荐 | 报价页内 | `GET /api/freight-rates/search`、`/compare`、`/recommend` |

### 6.7 预警 / 业务规则 / 流程配置 / 自定义报表

| 模块 | 是什么 | 页面 | 说明 |
| --- | --- | --- | --- |
| 预警中心 | 内置 5 条规则（ETA 临近/超期应收/报关临期/截港时间/青岛卡点），30 分钟 cron 扫描，幂等去重 | `/alerts` | `POST /api/alerts/run` 手动触发扫描 |
| 业务规则 | DB 化规则引擎，可配置规则类型、参数、触发方式 | 系统 → 业务规则 | 通用表达式规则无需写代码 |
| 流程配置 | 流程状态机配置化（order/booking/customs/finance 四类） | 系统 → 流程配置 | `POST /api/workflow/transition` 统一流转 |
| 自定义报表 | 报表定义 + 执行 | 系统 → 报表设计 | `POST /api/reports/:id/run` |

### 6.8 外部对接 / 场站 / 外部数据 / AI

| 模块 | 是什么 | 页面 | 关键 API |
| --- | --- | --- | --- |
| 外部对接 | 13 个适配器的配置中心（港口/海关/财务/船期/汇率/运价/美元支付/AI） | `/integrations` | `/api/integrations` |
| 场站查询 | 场站名录 + 按箱号/提单查询状态 | `/yards` | `/api/yards/status`、`/query` |
| 外部数据 | 免费第三方 API：AIS 船舶、船期、汇率、运价 | `/external` | `/api/external/*` |
| AI 助手 | 智能问答/单据识别/翻译生成/智能推荐（OpenAI 兼容） | `/ai` | `/api/ai/*` |
| 青岛港看板 | 7 节点看板、装载舱单检查、预警（示例插件） | `/qingdao` | `/api/qingdao/*` |

### 6.9 系统管理（RBAC）

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| 用户管理 | 系统管理 → 用户 | 创建用户、分配角色、禁用 |
| 角色与权限 | 系统管理 → 角色 | 角色数据范围（all/group/self）+ 权限点分配 |
| 小组管理 | 系统管理 → 小组 | 数据隔离维度，成员加入小组后可见小组内数据 |
| 公司设置 | 系统管理 → 公司 | 公司信息/部门/银行账号/开票抬头 |
| 发票号段 | 系统管理 | AR/AP 开票发号（SELECT FOR UPDATE 防并发重号） |
| 接口密钥 | 系统管理 | 供脚本/第三方系统认证（X-API-Key） |
| 审计日志 | 系统管理 | 写操作审计（POST/PUT/DELETE） |
| 自定义字段 | 系统管理 | 为订单/客户/订舱/财务扩展字段（配置级二开） |
| 备份恢复 | 系统管理 | 在线备份/下载/恢复 |
| 系统健康 | 系统管理 → 系统健康 | 六项健康检查 |

### 6.10 客户自助门户

客户角色专用，`customerId` 隔离，只读。路径 `/portal`：

| 能力 | 关键 API |
| --- | --- |
| 门户首页（概览+订单统计） | `GET /api/portal/overview` |
| 我的订单（只读） | `GET /api/portal/orders` |
| 我的账单（应收明细） | `GET /api/portal/bills` |
| 下载账单 PDF / 提单 PDF | `GET /api/portal/orders/:id/invoices/:invoiceId/download` 等 |
| 在线补料（SI） | `POST /api/portal/orders/:id/si` |
| 运价查询 | `GET /api/portal/rates` |

---

## 七、API 使用教程（每个接口怎么调）

### 7.1 统一约定

- **基础路径**：所有接口挂载在 `/api` 下。
- **认证**：除公开端点外，均要求 `Authorization: Bearer <JWT>`；脚本可用 `X-API-Key`；JWT 优先不回退。
- **统一响应**：
  - 成功：`{ code: 0, message: 'ok', data }`
  - 失败：HTTP 4xx/5xx + `{ code, message, data: null }`
  - 分页列表：`data: { list, total, page, pageSize }`（默认 `page=1`，`pageSize≤200`）
- **权限点**：格式 `module:action`，如 `order:read`；admin 持 `*`。

### 7.2 认证（先拿到 token）

```bash
# 登录 → 返回 token（存到 localStorage.token）与 refreshToken（经 httpOnly Cookie 下发）
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'

# 携带 token 访问业务接口
curl http://localhost:3000/api/orders \
  -H 'Authorization: Bearer <token>'
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录，独立限流（默认 15min/20 次） |
| POST | `/api/auth/refresh` | 轮换 refresh token |
| POST | `/api/auth/logout` / `/logout-all` | 登出 / 全端下线 |
| GET | `/api/auth/me` | 当前用户信息 + 权限点 |
| POST | `/api/auth/change-password` | 改密（改密即全局下线） |

### 7.3 统一 CRUD 蓝本（大多数资源通用）

以客户为例，其余资源（供应商/订单/订舱/报关/单证/跟踪/财务/报价/运价/费用模板等）形态一致：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/customers?page=1&pageSize=20&keyword=船` | 分页 + 关键字模糊搜索 + 任意字段精确过滤 |
| GET | `/api/customers?deleted=1` | 查看回收站（软删除） |
| GET | `/api/customers/:id` | 详情 |
| POST | `/api/customers` | 新建（`code` 留空自动生成 CUS 编号） |
| PUT | `/api/customers/:id` | 更新（带 `version` 触发乐观锁） |
| DELETE | `/api/customers/:id` | 软删除 |
| POST | `/api/customers/:id/restore` | 回收站恢复 |
| POST | `/api/customers/batch-delete` | `{ids:[1,2,3]}` 批量删除 |
| POST | `/api/customers/batch-update` | `{ids:[], data:{}}` 批量更新（改状态/启停） |

### 7.4 每个模块的 API 速查

> 下表列出主要端点，方法与路径见各模块章节。`(CRUD)` 表示该资源支持 7.3 节的标准 CRUD 全套端点。

| 资源 | 端点 | 特色接口 |
| --- | --- | --- |
| 认证 | `/api/auth/*` | me / refresh / sessions / change-password |
| 系统初始化 | `/api/system/init-status`、`/api/system/setup-admin` | 空库创建管理员 |
| Onboarding | `/api/onboarding/status`、`/demo-data`、`/wizard/done` | 空态判定、示例数据（增删） |
| 系统管理 | `/api/system/health`、`/defaults`、`/audit-logs`、`/backup` | 健康/默认币种/审计/备份恢复 |
| RBAC | `/api/roles`、`/users`、`/permissions`、`/groups` | `PUT /api/roles/:id/permissions`、`PUT /api/users/:id/roles` |
| 公司 | `/api/company/profile`、`/departments`、`/company-accounts`、`/invoice-titles` | — |
| 号段 | `/api/number-segments` | 发票开票发号 |
| 接口密钥 | `/api/api-keys` | 明文仅创建时返回一次 |
| 客户 | `/api/customers` (CRUD) | stats / overview / contacts / follows / attachments / import |
| 供应商 | `/api/suppliers` (CRUD) | import / batch |
| 订单 | `/api/orders` (CRUD) | detail / timeline / flow / advance / profit / export / batch-advance / batch-status |
| 订舱 | `/api/bookings` (CRUD) | — |
| 报关 | `/api/customs` (CRUD) | — |
| 单证 | `/api/documents` (CRUD) | search / generate / status / upload / download / file |
| 跟踪 | `/api/tracks` (CRUD) | — |
| 财务 | `/api/finance` (CRUD) | summary / currency-summary / reconcile / statement / aging / payments / invoices / periods / writeoff / reverse / batch |
| 报价 | `/api/quotations` (CRUD) | send / confirm / convert-order |
| 运价 | `/api/freight-rates` (CRUD) | search / compare / recommend |
| 看板 | `/api/dashboard` | + 8 个子端点（order-status / mode-dist / metrics / aging / sales-performance / team-workload 等） |
| 待办 | `/api/tasks/todo` | 聚合待办 |
| 消息 | `/api/messages`、`/message-preferences` | unread-count / read / read-all |
| 搜索 | `/api/search?keyword=` | 跨客户/供应商/订单/报价 |
| 流程节点 | `/api/flow-nodes`、`/api/orders/:id/nodes` | flow-stats |
| 自定义字段 | `/api/custom-fields` | 各实体值读写 `/api/orders/:id/custom-fields` |
| 放单 | `/api/release`、`/api/orders/:id/release` | approve / batch-approve |
| 一单多箱 | `/api/orders/:orderId/containers` | 覆盖式保存 `{items[]}` |
| 打印 | `/api/print-templates`、`/api/print/:docType/:bizId` | fields / copy / default / preview |
| 费用模板 | `/api/fee-templates` (CRUD) | — |
| 外部 API | `/api/external/vessel/:mmsi`、`/schedule`、`/rate`、`/freight-rate` | 免费第三方 |
| 港口 | `/api/ports`、`/ports/query`、`/ports/report` | — |
| EDI | `/api/edi/messages`、`/send-booking`、`/receive` | 报文 |
| 支付 | `/api/payments` | submit（USD 通道） |
| 场站 | `/api/yards` (CRUD) | status / records / query |
| 预警 | `/api/alerts` | run / resolve / ignore |
| 业务规则 | `/api/business-rules` | meta / test |
| 流程状态机 | `/api/workflow/status-options`、`/configs`、`/transition` | — |
| 报表 | `/api/reports` | meta / run |
| 集成 | `/api/integrations` | registry / trigger |
| AI | `/api/ai/status`、`/chat`、`/extract`、`/generate`、`/recommend` | 需 `ai:use` |
| 导入 | `/api/import/templates/:biz`、`/api/import/:biz` | 通用 Excel 批量导入 |
| 客户门户 | `/api/portal/*` | overview / orders / bills / si / rates / downloads |
| 青岛港 | `/api/qingdao/*` | nodes / checklist / alerts / manifest/check（插件挂载） |
| 通知 | `/api/notifications`、`/api/plugins/notification/*` | 出站通知（插件挂载） |

### 7.5 典型业务调用示例

```bash
# 创建订单（orderNo 自动生成 SO）
curl -X POST http://localhost:3000/api/orders \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"customerId":1,"type":"export","mode":"SEA"}' \

# 推进订单节点（手动流转）
curl -X POST http://localhost:3000/api/orders/1/advance \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"node":"booking"}' \

# 收款核销
curl -X POST http://localhost:3000/api/finance/payments \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"customerId":1,"direction":"in","amount":"1000.00","currency":"CNY","financeIds":[1,2]}'

# 报价转订单
curl -X POST http://localhost:3000/api/quotations/1/convert-order \
  -H 'Authorization: Bearer <token>'

# 触发一次预警扫描
curl -X POST http://localhost:3000/api/alerts/run -H 'Authorization: Bearer <token>'

# 打印某订单的提单（PDF）
curl 'http://localhost:3000/api/print/bl/1?format=pdf' -H 'Authorization: Bearer <token>' -o bill.pdf
```

### 7.6 接口文档（自动生成）

后端内置 Swagger（`swagger-jsdoc` + `swagger-ui-express`），启动后端后访问 `/api-docs`（或文档站 `/docs` 内嵌）可在线查看带示例的 OpenAPI 文档。

---

## 八、二次开发（进阶篇：从入门到精通）

> 扩展点分三级：**配置级（零代码）→ 文件级 → 插件级**。定制诉求越高越往右走。详见 [`docs/二开指南.md`](docs/二开指南.md)。

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

### 8.1 后端目录速查

```
backend/src/
├── server.js            # 入口：中间件顺序、路由挂载、模块加载、订阅注册、优雅停机
├── routes/index.js      # 全部业务路由（rest 资源一把梭）
├── controllers/         # 控制器（baseController.js 为统一 CRUD 工厂）
├── middleware/          # auth / dataScope / validate / audit / observability
├── models/              # 54 个 Sequelize 模型 + index.js 关联中枢
├── services/            # 业务服务（dataAccess / workflow / automation / alert / ai ...）
├── integrations/        # 外部对接适配器工厂 + adapters/
├── modules/             # 模块注册表（官方示例插件 notification、qingdao-port 在此）
├── core/                # moduleRegistry.js / auditService.js
├── validation/schemas.js# Joi 校验 schema
├── utils/               # logger / response / passwordPolicy
└── seedData/rbac.js     # 内置角色与权限种子
```

### 8.2 精通第一步：理解 CRUD 工厂（`src/controllers/baseController.js`）

`crudController(opts)` 一次性生成 8 个端点方法：`{ list, get, create, update, remove, batchRemove, batchUpdate, restore }`。

```js
// opts 说明
const ctrl = crudController({
  model: MyModel,          // Sequelize 模型（必填）
  name: 'myThing',         // 模块名，用于自动发射 {name}.created/updated/deleted 事件
  searchFields: ['code', 'name'],  // keyword 模糊搜索的字段
  includes: [{ model: Other, as: 'others' }], // 关联加载
  order: [['id', 'DESC']],
  codePrefix: 'MT',        // 为空时自动生成编号的逻辑前缀
  codeField: 'code',       // 编号字段
  protectedFields: ['storePath'], // 禁止用户写入的系统字段（防越权）
  scoped: true,            // 开启数据隔离（要求模型有 groupId/ownerId）
  beforeWrite: async (req, item, body) => {}, // 写入前钩子
});
```

内置能力：受保护字段剔除、`customFields` 自动 JSON 序列化、乐观锁（`version` 冲突返回 409）、软删除回收站（`deleted=1`）、数据隔离、自动归属、自动发号、自动发射事件。

### 8.3 新增一个 CRUD 模块（五步）

以新增"装卸公司管理"为例：

**① 建模型** `src/models/HandlingCompany.js`：

```js
const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  const HandlingCompany = sequelize.define('HandlingCompany', {
    code: DataTypes.STRING,
    name: { type: DataTypes.STRING, allowNull: false },
    contact: DataTypes.STRING,
    phone: DataTypes.STRING,
    groupId: DataTypes.INTEGER,   // 若需数据隔离
    ownerId: DataTypes.INTEGER,
  }, { paranoid: true });          // paranoid: true 启用软删除
  return HandlingCompany;
};
```

然后在 `src/models/index.js` 的 require、exports 与关联映射中注册该模型。

**② 建控制器** `src/controllers/handlingCompanyController.js`：

```js
const { HandlingCompany } = require('../services/dataAccess'); // 必须经 dataAccess，禁止直接 require models
const { crudController } = require('./baseController');

module.exports = crudController({
  model: HandlingCompany,
  name: 'handlingCompany',
  searchFields: ['code', 'name', 'contact'],
  codePrefix: 'HC',
  codeField: 'code',
  scoped: true, // 开启数据隔离
});
```

**③ 注册路由**：在 `src/modules/order.js`（或新建模块）的 `routes(router, mw)` 中：

```js
router.get('/handling-companies', guard('order', 'read'), ctrl.list);
router.post('/handling-companies', guard('order', 'create'), ctrl.create);
// ... 其余
```

**④ 加校验**（可选）`src/validation/schemas.js` 定义 Joi schema，路由挂 `validate(S.xxx)`。

**⑤ 加迁移** `backend/migrations/` 新增迁移文件，`migrateRunner` 启动自动执行。

### 8.4 新增一个对接适配器（最快上手）

**最快上手**：只需在 `backend/src/integrations/adapters/` 放一个导出 `{code, name, send, query}` 的文件，即被工厂自动注册，无需改任何业务代码。

参照 `src/integrations/adapters/customs.js`：

```js
module.exports = {
  code: 'myVendor',                       // 唯一 code，注册表按此建索引
  name: '我的供应商',
  async send(cfg, payload) { /* 调用对方写接口 */ },
  async query(cfg, payload) { /* 调用对方读接口 */ },
};
```

使用方式：

```js
const { IntegrationClient } = require('../integrations');
const client = IntegrationClient.get('myVendor');   // 从 IntegrationConfig 读配置
const result = await client.query({ keyword: 'xxx' });
```

接入真实系统时，在系统「外部对接」页启用适配器并填 `baseUrl / apiKey / config(JSON)`。

### 8.5 新增业务规则 / 自动化动作

**预警规则**：在 `src/services/ruleEngineService.js` 的 `executors` 注册表加 `my_rule: async (rule, params) => {...}`，再在 `BusinessRule` 表配 `ruleType='my_rule'` + `params` + `trigger`（cron 或事件名）。通用表达式规则（`ruleType='expr'`）无需写代码。

**自动化动作**：在 `src/services/automationService.js` 加 `async myAction(){...}`（幂等判断 + `logAudit` 审计），加入 `runAutomations()`；如需事件驱动，在 `subscribeEvents()` 里 `events.onAsync('xxx', ...)`。

### 8.6 新增一个插件（插件级）

参照 `src/modules/README.md` 的官方示例（notification、qingdao-port）：

```js
// backend/src/modules/<your-plugin>/index.js
module.exports = {
  name: 'your-plugin',          // 必填，与目录名一致
  title: '我的插件',
  dependencies: ['order'],      // 前置模块
  models: [MyModel],            // 插件专属模型
  routes(router, mw) {          // mw.guard = 权限守卫（核心注入）
    router.get('/my-plugin/x', mw.guard('order', 'read'), handler);
  },
  services: { myService },      // 暴露服务
  seed: async () => {},         // 初始化数据
  menu: { path: '/my-plugin', icon: 'Box', permission: 'order:read' },
  events: ['my-plugin.updated'],
};
```

放进目录即被 `ModuleRegistry.load` 自动发现；`mountRoutes` 自动挂载路由（`autoMount:false` 的存量模块除外）。

### 8.7 事件驱动（`src/services/eventBus.js`）

CRUD 事件由 `baseController` 自动发射（`{name}.created/updated/deleted`），领域事件手动发射。命名规范 `{module}.{action}`。

```js
const events = require('../services/eventBus');
events.on('order.created', ({ id, data, user }) => { /* 自定义逻辑 */ });
// 或异步监听（捕获异常不阻断主流程）
events.onAsync('customs.created', async (payload) => { /* ... */ });
```

### 8.8 前端二开（新增页面 + 路由 + 菜单）

① 在 `frontend/src/views/<模块>/` 新建 `.vue` 页面 → ② 在 `frontend/src/api/` 新增域 API 文件（用 `crud('resource')` 工厂 + 自定义接口） → ③ 在 `frontend/src/router/index.js` 的 `MainLayout` children 加路由（`meta.permission` 控制访问） → ④ 在 `frontend/src/layouts/MainLayout.vue` 的 `menuGroups` 对应分组加菜单项（`{ path, title, icon, permission }`） → ⑤ 确保后端下发对应权限点。

权限三件套：路由级 `meta.permission`、菜单级 `menuGroups` 过滤、按钮级 `v-permission="'order:delete'"`。

### 8.9 架构约束（务必遵守）

- 控制器只能通过 `services/dataAccess.js` 取模型，禁止直接 `require('../models')`。
- 跨域写收口：`FinanceRecord`/`AuditLog` 的写必须经 `domains/finance` 与 `core/auditService`。
- 迁移文件用 async/await，禁止 `.then()` 链；PostgreSQL 用 `$1,$2` 占位符，不用 MySQL 的 `?`。
- 金额字段必须 DECIMAL；生产禁用 `sequelize.sync()`，改表用迁移。
- 业务路由必须走 `dataScope` 中间件实现数据隔离；客户端不能直接传 `groupId` 越权分配。

---

## 九、部署与运维

- **前端**：`cd frontend && npm run build`，产物在 `frontend/dist/`，交 Nginx 托管并代理 `/api`。
- **后端**：`node src/server.js`，可用 `pm2` 守护；生产务必设 `NODE_ENV=production` 与 `JWT_SECRET`。
- **Docker 一键部署**：`docker compose up -d`（内置 PostgreSQL 服务，自动拉起；容器已配置资源限制与健康检查）。
- **部署前检查**：`cd backend && node scripts/check-env.js`，逐项核对 Node / Docker / 端口 / 磁盘 / 内存 / .env 密钥。
- **备份 / 恢复**：`cd backend && npm run backup`（归档到 `backend/backups/`，保留最近 7 份），恢复用 `npm run restore`；系统管理页亦可在线备份 / 恢复。
- **定时备份**：建议宿主机 crontab 配置 `npm run backup`（或启用 `BACKUP_CRON`）。
- **监控**：`/api/metrics`（Prometheus）、`/api/health`（数据库连通性）、慢查询告警、定时任务失败告警。

---

## 十、安全

- JWT 密钥生产环境强制环境变量，缺失拒绝启动；开发环境一次性随机。
- Helmet 安全头 + CORS 白名单 + 全局/登录限流。
- 文件上传扩展名白名单 + 路径穿越校验 + 字段保护黑名单。
- bcrypt 密码加密 + 操作审计日志 + RBAC 细粒度权限 + 数据范围隔离。
- 完整安全设计见 [`docs/安全设计.md`](docs/安全设计.md)。

---

## 十一、环境变量

完整列表见 [`.env.example`](.env.example)，关键项：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境（生产必设） | development |
| `PORT` | 后端端口 | 3000 |
| `JWT_SECRET` | JWT 密钥（生产必填） | 开发随机生成 |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | token 有效期 | 12h / 30d |
| `DB_*` | PostgreSQL 连接（host/port/name/user/password） | 本地 freight |
| `DB_POOL_MAX` | 连接池大小 | 30 |
| `CORS_ORIGIN` | 跨域白名单（逗号分隔） | localhost:5173 |
| `RATE_LIMIT_LOGIN_MAX` | 登录限流次数/15min | 20 |
| `BACKUP_KEEP` / `BACKUP_DIR` | 备份保留份数 / 目录 | 7 / ./backups |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 大模型对接兜底（未在表配置时生效） | openrouter |
| `PORT_SVC_URL` / `CUSTOMS_SVC_URL` / `FINANCE_SVC_URL` | 外部系统网关地址 | localhost:400x |

---

## 十二、参考文档

- **文档站**（VitePress）：`cd docs-site && npm install && npm run build`，构建产物输出到 `backend/public/docs/`，后端启动后访问 `/docs`。
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