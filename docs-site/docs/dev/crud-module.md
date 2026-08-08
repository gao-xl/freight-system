---
title: 新增业务模块
prev: /dev/reports
next: /dev/events
---

# 新增业务模块

> 系统所有标准列表页都基于**通用 CRUD 工厂** `backend/src/controllers/baseController.js` 的 `crudController()`。一个标准模块只需 **3 个文件**，且自动获得：分页列表 / 详情 / 创建 / 更新 / 删除 / 批量删除 / 批量更新 / 数据隔离 / 事件发射。

## 1. 三个文件

### ① 模型 `backend/src/models/Xxx.js`

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

然后在 `models/index.js` 里注册 + 声明关联（`belongsTo` / `hasMany`）。

### ② 控制器 `backend/src/controllers/xxxController.js`

```js
const { crudController } = require('./baseController');
const { Xxx } = require('../models');

module.exports = crudController({
  model: Xxx,
  name: 'xxx',                       // 用于自动发射 xxx.created/updated/deleted 事件
  searchFields: ['code', 'name'],    // 关键字模糊搜索字段
  order: [['id', 'DESC']],
  protectedFields: ['groupId'],      // 禁止前端篡改的字段
  scoped: true,                      // 开启数据隔离（模型需有 groupId/ownerId）
});
```

### ③ 路由 `backend/src/routes/index.js`

```js
const xxx = require('../controllers/xxxController');
router.get('/xxx', guard('xxx', 'list'), xxx.list);
router.post('/xxx', guard('xxx', 'create'), xxx.create);
// get / update / delete / batch-delete / batch-update 同理
```

## 2. crudController 配置项

| 配置 | 默认 | 说明 |
|------|------|------|
| `model` | 必填 | Sequelize 模型 |
| `name` | 必填 | 模块名，用于事件名 `{name}.created/.updated/.deleted` |
| `searchFields` | `[]` | `keyword` 模糊搜索字段 |
| `includes` | `[]` | 关联查询 |
| `order` | `[['id','DESC']]` | 默认排序 |
| `codePrefix` | 无 | 开启动态编号前缀 |
| `codeField` | 无 | 编号写入字段（create 时无值则 `genCode(codePrefix)`） |
| `protectedFields` | `[]` | create/update/batch-update 时剔除的系统字段 |
| `scoped` | `false` | 开启数据隔离（要求模型有 groupId/ownerId） |
| `beforeWrite` | 无 | `(req, item, body)` 写前钩子（create 时 item=null） |

真实示例（`customerController.js`）：

```js
const base = crudController({
  name: 'customer',
  model: Customer,
  searchFields: ['code', 'name', 'shortName', 'contact', 'phone'],
  codePrefix: 'CUS',
  codeField: 'code',
  order: [['id', 'DESC']],
  scoped: true,
});
```

## 3. 工厂自动提供的方法

```js
return { list, get, create, update, remove, batchRemove, batchUpdate };
```

- `list`：精确过滤（query 命中模型字段）+ keyword 模糊 + 分页
- `batchRemove`：`POST /:res/batch-delete { ids: [] }`
- `batchUpdate`：`POST /:res/batch-update { ids: [], data: {} }`
- 数据隔离：`scoped: true` 时，list 走 `scopedWhere`，写操作 `attachOwnership` 自动补 `groupId/ownerId`
- 事件：自动 `events.emit(\`${name}.created\`, ...)` 等
- 乐观锁：模型有 `version` 字段且请求带 `version` 时校验，不一致返回 409

## 4. 前端

- 在 `frontend/src/views/` 加页面
- `router/index.js` 注册路由并配 `meta.permission`（如 `permission: 'xxx:read'`）
- 菜单会按 `MainLayout.vue` 的 `hasPermission` 自动显隐

## 5. 需要自定义逻辑时

用 `beforeWrite` 钩子，而不是改工厂：

```js
crudController({
  model: Xxx,
  name: 'xxx',
  beforeWrite: async (req, item, body) => {
    if (body.amount) body.amount = round2(body.amount);   // create
    // item 为非空时是 update
  },
});
```

处理跨表、派生逻辑时，把逻辑下沉到 `services/`，用 [事务](/dev/best-practices) 保证原子性。

## 下一步

[事件订阅](/dev/events) —— 不改核心，在业务发生时挂自己的逻辑。