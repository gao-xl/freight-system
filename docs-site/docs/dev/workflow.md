---
title: 流程配置
prev: /dev/business-rules
next: /dev/print-template
---

# 流程配置

> 让订单/订舱/报关/财务的**状态流转不再是写死代码里的逻辑**，而是可配置的「从某状态 → 到某状态 → 谁允许 → 是否自动」规则。**无需改代码**，在系统「流程配置」里维护。

## 1. 状态机与业务节点

先分清两个概念：

- **状态机（WorkflowConfig）**：本页讲的。定义「状态 A → 状态 B」的合法流转、允许角色、是否自动。
- **业务节点（FlowNode / OrderNode）**：偏流程化的推进节点（订舱→装货→进港→…），见下文「补充」。

## 2. 数据模型

`backend/src/models/WorkflowConfig.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `bizType` | STRING(30)，默认 `order` | `order/booking/customs/finance` |
| `fromStatus` | STRING(40) | 当前状态，`'*'` 表示任意 |
| `toStatus` | STRING(40) | 目标状态 |
| `action` | STRING(50)，默认 `update_status` | 动作（当前仅 `update_status`） |
| `fromRole` | STRING(50) | 允许操作的角色（null=不限） |
| `auto` | BOOLEAN | 是否自动流转 |
| `enabled` | BOOLEAN 默认 true | 是否启用 |
| `sortOrder` | INT | 排序 |

## 3. 各业务类型的合法状态

`workflowService.js` 的 `STATUS_OPTIONS`：

| bizType | 状态 |
|---------|------|
| `order` | `draft / confirmed / in_progress / completed / cancelled` |
| `booking` | `pending / confirmed / loading / shipped / cancelled` |
| `customs` | `prepared / submitted / inspecting / released / rejected / closed` |
| `finance` | `unpaid / partial / paid / waived` |

## 4. 配置一条流转

```bash
curl -X POST http://localhost:3000/api/workflow/configs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bizType":"order","fromStatus":"draft","toStatus":"confirmed","fromRole":"operator","auto":false}'
```

配置路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflow/configs?bizType=&enabled=` | 查配置 |
| GET | `/api/workflow/status-options` | 查各类型合法状态 |
| POST | `/api/workflow/configs` | 新建（重复流转返回 409） |
| PUT | `/api/workflow/configs/:id` | 更新 |
| DELETE | `/api/workflow/configs/:id` | 删除 |
| POST | `/api/workflow/transition` | 执行流转（body: `{ bizType, id, toStatus, fromStatus }`） |

## 5. 流转执行逻辑（了解即可）

`transaction` 走 `workflowService.transition({ bizType, id, toStatus, fromStatus })`：

1. 校验 `bizType/id`
2. 查**启用**的 WorkflowConfig 匹配 `from → to`（`fromStatus` 支持 `'*'` 通配）
3. 角色校验（`fromRole` 为 `'*'` 或匹配用户角色或 admin 通过）
4. 执行动作（仅 `update_status`：`rec.update({ status })`）
5. 写审计 `AuditLog` + 发 `${bizType}.transitioned` 事件

> 这意味着配置好的流转会**自动走权限校验 + 审计 + 事件**，二开者无需再写这部分。

## 6. 补充：业务节点推进（FlowNode / OrderNode）

若你关注的是「订舱→装货→进港→报关→放行…」这样的**流程节点看板**，那是另一套机制：

- `FlowNode`：节点模板（export/import 各一套，如 export 有 `booking→pickup→stuffing→gate_in→arrival_report→customs→release→loading_manifest→loaded→departure`）
- `OrderNode`：订单实例上的节点状态（`done / blocked / pending`）
- 接口在 `flowController.js`：`listFlowNodes / updateFlowNode / orderNodes / updateOrderNode / flowStats`

节点推进通常由 [自动化](/dev/business-rules) 或核心 `orderController` 的 `computeReached` 派生，一般无需手配。

## 下一步

[打印模板](/dev/print-template) —— 定制单证/提单版式。