---
title: 后端规范
prev: /dev/code-review
next: /dev/coding-frontend
---

# 后端规范

> 基于真实代码结构（`backend/src/`）定义的分层、命名与实现规范。所有后端二开必须遵守。

## 1. 分层架构

```
controllers/   控制器：HTTP 入参 → 调服务 → 返回 { code, message, data }
services/      业务逻辑：跨表、派生、事务、外部调用
models/        Sequelize 模型：表结构 + 关联
integrations/  外部对接适配器
middleware/    中间件：auth / audit / dataScope / validate
routes/index.js  路由总表（唯一权威来源）
```

**依赖方向**：`controllers → services → models`，禁止反向。

- 控制器只做「接参 + 校验 + 返回」，不含业务逻辑
- 跨表、派生、事务逻辑下沉 `services/`
- 单文件 ≤ 300 行，超了拆 service

## 2. 模型规范

`models/Xxx.js` 标准写法：

```js
const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Xxx', {
  code: { type: DataTypes.STRING, unique: true },   // 业务编号加唯一约束
  name: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(14, 2) },        // 金额一律 DECIMAL，禁止 FLOAT
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  groupId: { type: DataTypes.INTEGER },              // 数据隔离字段（可选）
  ownerId: { type: DataTypes.INTEGER },
});
```

- 金额字段一律 `DECIMAL(14,2)`，禁止 `FLOAT`
- 业务编号（code）加 `unique: true`
- 需要数据隔离的模型带上 `groupId / ownerId`
- 在 `models/index.js` 注册 + 声明关联（`belongsTo` / `hasMany` / `belongsToMany`）

关联写法参考：

```js
Order.belongsTo(Customer, { as: 'customer', foreignKey: 'customerId' });
Customer.hasMany(Order, { foreignKey: 'customerId' });
Quotation.hasMany(QuotationItem, { as: 'items', foreignKey: 'quotationId' });
User.belongsToMany(Role, { through: UserRole, as: 'roles', foreignKey: 'userId' });
```

## 3. 控制器规范

优先用通用 CRUD 工厂 `crudController`（见 [新增业务模块](/dev/crud-module)）：

```js
const { crudController } = require('./baseController');
const { Xxx } = require('../models');

module.exports = crudController({
  model: Xxx,
  name: 'xxx',
  searchFields: ['code', 'name'],
  order: [['id', 'DESC']],
  protectedFields: ['groupId'],
  scoped: true,
});
```

- 需要自定义逻辑时用 `beforeWrite` 钩子，不改工厂
- 复杂业务逻辑下沉 service，控制器保持薄

## 4. 路由与权限

- 路由统一声明在 `routes/index.js`（除非写成插件）
- 每个接口挂 `guard(module, action)`：

```js
router.get('/xxx', guard('xxx', 'read'), xxx.list);
router.post('/xxx', guard('xxx', 'create'), xxx.create);
```

- 新权限点在 `seed.js` 的权限记录里登记

## 5. 数据隔离

- 列表用 `scopedWhere(req, where)`
- 单条用 `scopedFindOne(req, model, where, includes)`
- 创建用 `attachOwnership(req, body)` 自动补 `groupId/ownerId`
- **禁止** `Model.findAll({ where: req.query })` 裸查（会绕过隔离）

## 6. 事务

跨表原子操作用 `supports/transaction.js`：

```js
const { withTransaction } = require('../services/transaction');
const result = await withTransaction(async (t) => { /* 多步写 */ return x; });
```

## 7. 事件

- 需要「某件事发生时挂逻辑」用 `events.onAsync('order.created', ...)`（见 [事件订阅](/dev/events)）
- handler 必须 try/catch，能用 `onAsync` 就用 `onAsync`

## 8. 校验

- 对外接口用 `middleware/validate.js` + `validation/schemas.js`（Joi）
- 入参必须校验，禁止把未校验的 query 直接拼进查询

## 9. 命名规范

| 项 | 规范 | 示例 |
|----|------|------|
| 模型文件 | 类名.js | `Order.js` |
| 控制器 | 小驼峰 + Controller | `orderController.js` |
| 服务 | 小驼峰 + Service | `reportService.js` |
| 路由资源 | 复数小写 | `/orders` |
| 权限点 | 模块:动作 | `order:read` |
| 事件名 | 模块.动作 | `order.created` |

## 下一步

[前端规范](/dev/coding-frontend) —— Vue3 结构、路由、状态、权限。