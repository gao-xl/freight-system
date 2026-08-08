---
title: 打印模板
prev: /dev/workflow
next: /dev/reports
---

# 打印模板

> 定制公司自己的单证/提单/发票版式。系统内置**可配置打印模板引擎**，版式、字段、页眉页脚都在系统里维护，**无需改代码**。

## 1. 数据模型

`backend/src/models/PrintTemplate.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | STRING(100) | 模板名 |
| `docType` | ENUM `bl/invoice/packing_list/quotation/customs/statement/order/settlement` | 单据类型 |
| `content` | TEXT(JSON) | 模板区块定义 |
| `isDefault` | BOOLEAN | 是否该类型默认 |
| `pageSize` | STRING(20) | `A4/A5/Letter` |
| `logoUrl` | STRING(255) | 公司 Logo |
| `header` / `footer` | TEXT | 页眉 / 页脚 |
| `remark` | TEXT | 备注 |

## 2. 模板路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/print-templates?docType=bl` | 查模板（按 docType 过滤，默认排前） |
| GET | `/api/print-templates/fields/:docType` | 查该类型可用字段库 |
| POST | `/api/print-templates` | 新建（无 content 时自动用默认模板） |
| POST | `/api/print-templates/:id/copy` | 复制 |
| POST | `/api/print-templates/:id/default` | 设为默认 |
| POST | `/api/print-templates/:id/preview` | 预览 |
| GET | `/api/print/:docType/:bizId?template=&format=` | 打印（html 或 pdf） |

## 3. 打印引擎如何解析

`backend/src/services/printService.js`：

- **字段取值** `getByPath(obj, path)`：点路径取值，如 `order.customer.name`
- **格式化** `formatValue(value, type)`：date→`YYYY-MM-DD`；money→千分位两位；空→`-`
- **核心** `resolveFields(blocks, bizData)`：遍历区块，对 `type==='fields'` 的区块逐个取字段值（`show` 为 false 的空值）
- **区块** `blockToHtml`：支持 `header / logo / fields / table / sign / footer` 六种区块
- **组装数据** `loadBizData(docType, bizId)`：按 docType 从库组装 `biz` 对象（含 `order`/`booking`/`quotation+items`/`customs`/`finance`）
- **主入口** `render(templateId, docType, bizId)`：
  1. 有 `templateId` → 用指定模板
  2. 否则按 `docType + isDefault:true` 查默认模板
  3. 仍无 → 用 `defaultContent(docType)` 兜底
  4. `resolveFields` 后，表格区块按 `quotation.items` / `finance` 注入行数据
  5. 返回 `{ html, pdf, tpl }`

## 4. 字段库

`backend/src/data/printFields.js` 的 `FIELDS` 按 docType 给出字段元数据，每项 `{ key, label, group, type }`：

- `key` 语法：`数据源.字段`，支持嵌套，如 `order.customer.name`
- `type`：`string / number / date / money / table`
- 覆盖 8 种单据类型

> 想加一个模板字段展示，先看 `GET /api/print-templates/fields/:docType` 里有没有对应 key；没有的字段才需要扩展字段库。

## 5. 实操流程

1. 系统 → 打印模板 → 按 docType 新建模板（或复制默认）
2. 用区块编辑器摆版式：页眉、Logo、字段、表格、签名、页脚
3. 字段用点路径绑定（如 `order.customer.name`）
4. 设为默认 → 在业务单据页点「打印」，`loadBizData` 自动填数据渲染

## 6. 何时需要写代码

- **加字段**：`FIELDS` 里没有的 key —— 在 `printFields.js` 对应 docType 下加一项即可
- **加区块类型**：6 种区块不够 —— 在 `blockToHtml` 里扩展
- **定制更强逻辑**：在 `loadBizData` 里扩展数据组装

> 这些改动都会影响该 docType 的所有模板，属于「核心数据层」修改，改动前建议先确认没有更轻的配置替代方案。

## 下一步

[报表](/dev/reports) —— 做公司特色统计报表。