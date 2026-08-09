---
title: 自定义字段
prev: /dev/coding-frontend
next: /dev/business-rules
---

# 自定义字段

> 覆盖 **80% 的「我们公司还想记一个字段」** 诉求（指定货代、付款条款、特殊要求……），**无需改表、无需改前端表单**——通过配置即可。这是系统最常用的零代码扩展点。

## 1. 数据模型

`backend/src/models/CustomField.js`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `bizType` | ENUM `order/customer/booking/finance` | 绑定业务类型 |
| `fieldKey` | STRING(50) | 字段标识（如 `custom_agent`） |
| `label` | STRING(50) | 字段名（前端显示） |
| `fieldType` | ENUM `string/number/date/enum/bool` | 字段类型 |
| `options` | TEXT(JSON) | `enum` 的可选项数组 |
| `required` | BOOLEAN | 是否必填 |
| `isList` | BOOLEAN | 是否进列表列 / 参与搜索 |
| `enabled` | BOOLEAN | 是否启用 |
| `sort` | INTEGER | 排序 |

## 2. 定义字段（管理员）

```bash
curl -X POST http://localhost:3000/api/custom-fields \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bizType":"order","fieldKey":"poNo","label":"客户PO号","fieldType":"string","isList":true,"isSearch":true}'
```

字段定义路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/custom-fields?bizType=order` | 查定义（可按 bizType 过滤） |
| POST | `/api/custom-fields` | 新建定义（需 `system:custom` 权限） |
| PUT | `/api/custom-fields/:id` | 更新 |
| DELETE | `/api/custom-fields/:id` | 删除 |

> **注意**：`options` 在数据库里存 JSON 字符串，通过 API 传数组即可，后端自动序列化。

## 3. 读写业务记录上的自定义字段值

业务模型（Order / Customer / Booking / FinanceRecord）自带 `customFields`（JSON 列），通过以下接口读写：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders/:id/custom-fields` | 读某条记录的自定义字段（填充 value + 解析后的 options） |
| PUT | `/api/orders/:id/custom-fields` | 写（body 为 `{ fieldKey: value }`） |

对应 `customer` / `booking` / `finance` 同理，把路径里的 `orders` 换成对应资源即可。

```bash
# 读
GET /api/orders/123/custom-fields

# 写（覆盖式）
PUT /api/orders/123/custom-fields
{ "poNo": "PO-2026-001" }
```

> 写入时只保存**已定义**（validKeys）的 key，未定义的会被忽略——避免脏数据。

## 4. 前端如何工作

不需要改前端代码：

- 定义字段后，前端按 `GET /api/custom-fields?bizType=order` 拉取定义
- 表单页按 `fieldType` **动态渲染**对应控件（string→输入框、enum→下拉、bool→开关…）
- 列表页按 `isList` 动态渲染列，搜索时把 `isSearch` 字段拼进查询参数

## 5. 常见场景配置示例

| 场景 | 配置 |
|------|------|
| 订单加「指定货代」下拉 | `bizType=order, fieldKey=custom_agent, fieldType=enum, options=["青岛班轮","上海外运"]` |
| 客户加「付款条款」文本 | `bizType=customer, fieldKey=payment_terms, fieldType=string` |
| 订单加「是否急单」开关 | `bizType=order, fieldKey=is_urgent, fieldType=bool` |

## 6. 进阶：给其它资源也加自定义字段

如果内置的 4 个 `bizType` 不够用，需要给新资源加自定义字段，用 `customFieldValues(bizType, model)` 工厂：

```js
// controllers/xxxController.js
const customField = require('./customFieldController');

module.exports = {
  ...crudController({ model: YourModel, name: 'yourmod' }),
  // 复用工厂方法，自动具备 getValues / updateValues
  getValues: customField.customFieldValues('yourbiz', YourModel).getValues,
  updateValues: customField.customFieldValues('yourbiz', YourModel).updateValues,
};
```

然后在 `routes/index.js` 注册两个路由即可。这也是「新增业务模块」时自带自定义字段的标准做法。

## 7. 性能提示

- `isSearch` 只对标记的字段参与检索，避免全表 JSON 扫描
- PostgreSQL JSONB 索引提升检索性能，量大时对 `isSearch` 字段建索引更快、更稳

## 下一步

[业务规则](/dev/business-rules) —— 让系统对业务异常自动预警或拦截。