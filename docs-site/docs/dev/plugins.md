---
title: 插件协议
prev: /dev/adapters
next: /dev/permissions
---

# 插件协议

> 插件化二开入口。**一个插件 = 一个目录 `backend/src/modules/<name>/index.js`**，按协议导出，由 `ModuleRegistry` 统一加载。放进目录即被自动发现。

## 1. 协议字段

```js
module.exports = {
  name,          // 必填，唯一标识（小写英文，与目录名一致）
  title,         // 可选，中文名（日志/菜单）
  dependencies,  // 可选，string[] 前置模块名，决定加载顺序（拓扑排序）
  models,        // 可选，Sequelize 模型数组 → 聚合到 registry.models
  routes,        // 可选，(router, mw) => void，声明本模块路由
  services,      // 可选，对象，键为服务名 → 暴露给其它模块
  seed,          // 可选，async () => void，初始化数据
  menu,          // 可选，{ path, icon, permission } → 自动补 module 字段后入 menus
  events,        // 可选，string[]，登记本模块事件名
  autoMount,     // 可选，false = 路由已在别处挂载（存量模块迁移用）
};
// 除 name 外全部可省略
```

> 协议外字段会忽略并告警（`[MODULE] 含协议外字段`），不阻断。

## 2. 完整插件示例

```js
// backend/src/modules/invoice/index.js
const { guard } = require('../../middleware/permissionService');
const invoiceCtrl = require('../../controllers/invoiceController');
const Invoice = require('../../models/Invoice');

module.exports = {
  name: 'invoice',
  title: '发票管理',
  dependencies: ['order'],          // 前置模块
  models: [Invoice],
  routes(router, mw) {
    router.get('/invoices', guard('invoice', 'read'), invoiceCtrl.list);
  },
  services: { invoiceService },
  seed: async () => { /* 初始化数据 */ },
  menu: { path: '/invoices', icon: 'Tickets', permission: 'invoice:read' },
  events: ['invoice.created'],
};
```

## 3. 加载机制

`backend/src/core/moduleRegistry.js`：

- `ModuleRegistry.load(dir)`：扫描 `src/modules/` 下**子目录**的 `index.js`，只登记元信息，**不碰 Express 路由表**
- 显式 `mountRoutes(router, mw)` 才挂载路由（`autoMount !== false` 的才挂）
- `loadFromList(modules, { router, middleware })`：注册 + 拓扑排序 + 按依赖顺序挂载
- `seedAll()`：按依赖顺序执行所有 `seed`，单失败不中断
- **加载与挂载分离**：往 `modules/` 丢一个新目录不会静默改现有路由

## 4. 生命周期

```
启动
 ├─ ModuleRegistry.load(modules目录)   发现 + 校验 + 登记（零副作用）
 └─ ModuleRegistry.mountRoutes(router) 挂载 autoMount!==false 的路由
```

- 单个插件加载失败被隔离，不影响服务启动
- `npm run dev` 日志里看 `[MODULE] 已注册模块` 确认加载

## 5. 官方可运行范本

| 插件 | 演示 | 用法 |
|------|------|------|
| `notification` | 事件订阅 → 企微 Webhook | **新插件标准写法** |
| `qingdao-port` | 存量模块收拢为插件 | `autoMount` 用法 |

## 6. 动手实验

1. 复制 `notification/` 为 `my-notify/`，改 `name`
2. 换一个事件名（如 `finance.updated`）
3. 重启后端，看日志 `[MODULE] 已注册模块: my-notify`
4. 触发事件，验证收到推送

## 7. 与其它扩展点的关系

- 插件是**代码级扩展的收口**：自定义字段、规则、事件订阅、路由、服务、菜单都能装进一个插件
- `<name>` 目录 = 你的二开产物边界，升级系统不冲突（"新增不覆盖"铁律）
- 未来 Monorepo 物理拆分时，插件边界可直接复用，拆分风险低

> 插件协议的最佳文档是可运行的例子：先看 `customer` / `notification` 样板，再照抄改写。

## 下一步

[权限与数据隔离](/dev/permissions) —— 理解新接口如何被正确保护。