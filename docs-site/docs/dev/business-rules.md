---
title: 业务规则
prev: /dev/custom-fields
next: /dev/workflow
---

# 业务规则

> 把「业务预警 / 校验拦截」从代码抽出为**可配置规则**，如：报价毛利过低预警、信用额度超限拦截、ETA 临近提醒。**无需改代码**，在系统「业务规则」里配一条即可。

## 1. 数据模型

`backend/src/models/BusinessRule.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | STRING(100) | 规则名 |
| `bizType` | STRING(30)，默认 `order` | `order/finance/booking/customs/customer` |
| `ruleType` | STRING(50)，默认 `expr` | `expr`（通用表达式）或内置执行器标识 |
| `trigger` | STRING(50)，默认 `cron` | `cron`（定时扫描）或事件名（如 `order.created`） |
| `condition` | TEXT(JSON) | 表达式条件 |
| `params` | TEXT(JSON) | 内置执行器参数 |
| `action` | TEXT(JSON) | 产出预警的配置 |
| `enabled` | BOOLEAN | 是否启用 |

## 2. 两种规则类型

### 2.1 通用表达式规则（`ruleType='expr'`）——推荐

条件用**白名单字段 + 白名单操作符**表达，**禁 eval，安全**：

```json
// condition 单条件
{ "field": "totalAmount", "op": "gt", "value": 10000 }

// condition 复合
{ "and": [ { "field": "status", "op": "eq", "value": "in_progress" },
            { "field": "totalAmount", "op": "gt", "value": 10000 } ] }
```

**操作符白名单**：`eq / ne / gt / gte / lt / lte / contains / in / isNull / between`

**字段白名单**（order 可判断）：`id / orderNo / status / eta / cutoffTime / totalAmount / currency / customerId / ownerId / groupId / createdAt` 等。其它 `bizType` 有各自的字段白名单。

### 2.2 内置执行器（`ruleType` = 执行器标识）

| 执行器 | 参数 | 功能 |
|--------|------|------|
| `order_amount_over` | `{ threshold, currency }` | 订单金额超阈值 |
| `eta_soon` | `{ days }`（默认 7） | ETA 临近提醒 |
| `overdue_receivable` | `{ overdueDays }`（默认 30） | 超期应收 |

## 3. 触发方式

- `trigger = 'cron'`：随每 30 分钟定时任务扫描（`alertScheduler`）
- `trigger = 事件名`：如 `order.created`，事件驱动即时触发

## 4. 产出预警（action 配置）

`action` 是 JSON，可覆盖预警的行为：

```json
{
  "type": "business_rule",
  "level": "warning",
  "title": "订单金额超限",
  "message": "订单 {orderNo} 金额 {totalAmount} 超过阈值",
  "dedupKey": "rule_amount:order:{id}"
}
```

- `level`：`info / warning / danger`
- `title` / `message`：支持 `{field}` 模板替换（从命中记录取字段值）
- `dedupKey`：幂等键，同一件事只报一次

## 5. 引擎如何工作（了解即可）

`backend/src/services/ruleEngineService.js`：

- `runDbRules({ trigger })`：跑所有 enabled 规则，按 trigger 过滤，返回匹配数
- `runRule(rule)`：执行单条
- 命中记录 → 通过 `upsertAlert` 写入 `AlertRecord`，展示在「预警中心」

> 二开者一般**不需要**碰这个引擎。想加新规则，直接在系统「业务规则」页配置即可；只有白名单表达不了的特殊逻辑，才考虑用 [事件订阅](/dev/events) 或改 `alertService`（见「时机」）。

## 6. 何时需要写代码

表达式白名单覆盖不了，且事件订阅也挂不上的复杂规则，才需要：

1. 在 `alertService.js` 里加一个 `ruleXxx()` 函数（无参，扫描 → upsertAlert）
2. 在 `runAllRules()` 里加一行调用
3. 纪律：必须用 `upsertAlert` + `dedupKey`（防重复轰炸）；单条规则报错不影响其它规则

## 下一步

[流程配置](/dev/workflow) —— 让订单/订舱/报关的状态流转规则可配置。