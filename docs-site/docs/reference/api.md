# API 概览

系统自带 OpenAPI 文档，运行后访问：

- Swagger UI：`http://localhost:3000/api-docs`
- 原始 JSON：`http://localhost:3000/openapi.json`

## 认证

| 方式 | 头 | 适用 |
|------|-----|------|
| JWT（登录返回） | `Authorization: Bearer <token>` | 浏览器端 |
| API Key | `X-API-Key: <key>` | 脚本/机器人/第三方 |

## 核心端点

| 领域 | 端点 | 说明 |
|------|------|------|
| 认证 | `POST /api/auth/login` | 登录（独立限流，防枚举） |
| 客户 | `GET/POST/PUT/DELETE /api/customers` | CRUD |
| 订单 | `GET/POST/PUT/DELETE /api/orders` | CRUD + 批量 |
| 订单流转 | `GET /api/orders/:id/flow` | 节点状态 |
| 订单推进 | `POST /api/orders/:id/advance` | 手动推进节点 |
| 财务 | `GET/POST /api/finance` | 应收应付 |
| 对账单 | `GET /api/finance/statement` | 按客户/月份 |
| 预警 | `GET /api/alerts` | 预警列表 |
| 规则引擎 | `GET/POST/PUT/DELETE /api/business-rules` | 配置化规则 |
| 流程配置 | `GET/POST /api/workflow/configs` | 状态流转规则 |
| 统一流转 | `POST /api/workflow/transition` | 校验+审计+事件 |
| 报表 | `POST /api/reports/:id/run` | 自定义报表执行 |
| 导入 | `GET /api/import/templates/:biz` | Excel 模板 |
| 导入 | `POST /api/import/:biz` | 批量导入 |

## 响应约定

成功：`{ "code": 0, "message": "ok", "data": ... }`

失败：HTTP 状态码 + `{ "code": <业务码>, "message": "...", "data": null }`

- 400 参数错误 / 403 无权限或未配置流转 / 404 不存在 / 409 并发冲突 / 429 限流

## 并发控制（乐观锁）

更新时携带 `version` 字段，服务端校验不一致返回 409：

```json
PUT /api/orders/5
{ "remark": "改备注", "version": 0 }
```

不带 `version` 的更新保持兼容（不做校验）。成功更新后 `version` 自增。
