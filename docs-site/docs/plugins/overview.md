# 插件协议

插件 = 一个目录 `backend/src/modules/<name>/index.js`，按协议导出。放进目录即被自动发现。

## 协议字段

```js
module.exports = {
  name,          // 必填，唯一标识，与目录名一致
  title,         // 中文名（日志/菜单）
  dependencies,  // string[] 前置模块
  models,        // Sequelize 模型数组（随插件注册）
  routes,        // (router, mw) => void，mw.guard 为核心注入的权限守卫
  services,      // 对象，暴露给其他模块
  seed,          // async () => void 初始化数据
  menu,          // { path, icon, permission } 前端菜单
  events,        // string[] 本插件发射/订阅的事件名
  autoMount,     // false = 路由已在别处挂载（存量模块迁移用）
};
```

## 生命周期

```
启动
 ├─ ModuleRegistry.load(modules目录)  发现 + 校验 + 登记（零副作用）
 └─ ModuleRegistry.mountRoutes(router) 挂载 autoMount!==false 的路由
```

单个插件加载失败被隔离，不影响服务启动。**往 modules/ 丢新目录不会静默改路由**——必须走 mountRoutes。

## 最小插件

```js
const { logger } = require('../../utils/logger');

module.exports = {
  name: 'hello',
  title: 'Hello 插件',
  routes(router, mw) {
    router.get('/hello', mw.guard('order', 'read'), (req, res) => {
      res.json({ message: 'hello from plugin' });
    });
  },
  // 挂载后自动订阅事件（幂等）
  // subscribe() 里 events.onAsync('order.created', ...)
};
```

## 校验与排障

- 协议外字段会被忽略并告警（`[MODULE] 含协议外字段`）
- 加载失败记录 `[MODULE] 模块加载失败，已跳过`，其余模块不受影响
- `npm run dev` 日志里看 `[MODULE] 已注册模块` 确认加载

## 可运行范本

- `notification`：事件订阅 → 企微 Webhook（新插件标准写法）
- `qingdao-port`：存量模块收拢为插件（autoMount 用法）
