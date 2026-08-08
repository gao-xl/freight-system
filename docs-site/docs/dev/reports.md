---
title: 报表
prev: /dev/print-template
next: /dev/crud-module
---

# 报表

> 公司特色统计/对账报表，**不写死后端接口**——维护一份「报表定义」（数据源 + 分组 + 聚合 + 过滤），通用执行引擎自动出表/图。

## 1. 数据模型

`backend/src/models/ReportDefinition.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | STRING(100) | 报表名 |
| `bizType` | STRING(30)，默认 `order` | 数据源 `order/finance/customer` |
| `groupBy` | STRING(50) | 分组字段（白名单） |
| `measures` | TEXT(JSON) | 聚合：`[{ field, agg, alias }]` |
| `filters` | TEXT(JSON) | 过滤：`[{ field, op, value }]` |
| `chartType` | STRING(20)，默认 `table` | `table/bar/pie/line` |
| `enabled` | BOOLEAN | 是否启用 |
| `remark` | STRING(255) | |

## 2. 报表路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports/meta` | 查数据源/字段白名单/聚合/图表类型 |
| GET | `/api/reports?keyword=&enabled=` | 查报表列表 |
| POST | `/api/reports` | 新建（需 `name/bizType`，`measures` 非空） |
| PUT | `/api/reports/:id` | 更新 |
| DELETE | `/api/reports/:id` | 删除 |
| POST | `/api/reports/:id/run` | 执行报表 |

## 3. 各数据源的字段白名单与聚合

`reportService.js` 的 `MODEL_MAP` + 白名单：

| bizType | 可字段 | 聚合 `AGGS` |
|---------|--------|:---:|
| `order` | `id/orderNo/status/type/customerId/salesId/totalAmount/currency/createdAt/eta` | `sum/count/avg/min/max` |
| `finance` | `id/direction/status/category/amount/localAmount/currency/orderId/customerId/createdAt/dueDate` | 同上 |
| `customer` | `id/name/level/ownerId/createdAt` | 同上 |

## 4. 定义一张报表

```json
{
  "name": "月度应收按客户汇总",
  "bizType": "finance",
  "groupBy": "customerId",
  "measures": [
    { "field": "amount", "agg": "sum", "alias": "应收总额" },
    { "field": "id", "agg": "count", "alias": "笔数" }
  ],
  "filters": [
    { "field": "direction", "op": "eq", "value": "receivable" },
    { "field": "status", "op": "in", "value": ["unpaid", "partial"] }
  ],
  "chartType": "bar"
}
```

**过滤操作符**：`eq/ne/gt/gte/lt/lte/contains/in/isNull`——与业务规则的白名单一致，**无 eval，安全**。

## 5. 执行引擎（了解即可）

`reportService.runReport(def)`：

1. 校验 `measures`（不能为空）
2. 构建聚合 `attributes = [ fn(agg, field), alias ]`
3. 分组字段放首位 `groupKey`，过滤 + 排序
4. `Model.findAll({ attributes, where, group, order, raw: true, limit: 500 })`
5. 返回 `{ bizType, groupBy, columns, measures, rows, chartType }`

前端用通用表格/图表（复用 ECharts 渲染层）渲染，无需针对每张报表写页面。

## 下一步

进入 [代码级扩展](/dev/crud-module) —— 学习用通用 CRUD 工厂新增一个业务模块。