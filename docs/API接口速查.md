# API 接口速查

后端接口统一挂载在 `/api` 下。本文汇总接口约定、认证方式、通用 CRUD 形态与各模块端点速查，供开发与联调参考。在线接口文档（含调用示例）见 Swagger：启动后端后访问 `/api-docs`。

## 一、统一约定

- 认证：除公开端点外，均要求 `Authorization: Bearer <JWT>`；脚本可用 `X-API-Key`；JWT 优先，不自动回退
- 成功响应：`{ code: 0, message: 'ok', data }`
- 失败响应：HTTP 4xx/5xx + `{ code, message, data: null }`
- 分页列表：`data: { list, total, page, pageSize }`（默认 `page=1`，`pageSize ≤ 200`）
- 权限点：格式 `module:action`，如 `order:read`；admin 持有 `*`

## 二、认证

```bash
# 登录 → 返回 token（存 localStorage.token）+ refreshToken（经 httpOnly Cookie 下发）
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

## 三、通用 CRUD

大多数资源（客户、供应商、订单、订舱、报关、单证、跟踪、财务、报价、运价、费用模板等）形态一致。以客户为例：

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

## 四、各模块 API 速查

下表列出主要端点。`(CRUD)` 表示该资源支持第三节的标准 CRUD 全套端点。

| 资源 | 端点 | 特色接口 |
| --- | --- | --- |
| 认证 | `/api/auth/*` | me / refresh / sessions / change-password |
| 系统初始化 | `/api/system/init-status`、`/api/system/setup-admin` | 空库创建管理员 |
| Onboarding | `/api/onboarding/status`、`/demo-data`、`/wizard/done` | 空态判定、示例数据（增删） |
| 系统管理 | `/api/system/health`、`/defaults`、`/audit-logs`、`/backup` | 健康 / 默认币种 / 审计 / 备份恢复 |
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

## 五、典型调用示例

```bash
# 创建订单（orderNo 自动生成 SO）
curl -X POST http://localhost:3000/api/orders \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"customerId":1,"type":"export","mode":"SEA"}'

# 推进订单节点（手动流转）
curl -X POST http://localhost:3000/api/orders/1/advance \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"node":"booking"}'

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