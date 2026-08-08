---
title: 事件订阅
prev: /dev/crud-module
next: /dev/adapters
---

# 事件订阅

> 系统内置事件总线 `backend/src/services/eventBus.js`。所有 `crudController` 管理的写操作会自动发射事件；领域动作（订舱装船、报关完成等）由对应控制器手动发射。**二开者无需改核心代码，订阅事件即可挂自己的逻辑**（如"订单创建后推送企业微信 / Webhook"）。

## 1. 事件总线 API

```js
const events = require('../services/eventBus');

// 异步监听（推荐）：handler 抛错被捕获，不影响主流程
events.onAsync('order.created', async (env) => {
  // env = { event: 'order.created', payload: { id, data, user }, time: '...' }
  console.log('收到新订单', env.payload.data);
});

// 同步监听：需自行 try/catch
events.on('finance.created', (env) => { /* ... */ });

// emit（一般由核心自动发射，二开很少直接调）
const envelope = events.emit('order.created', { id, data, user });
```

## 2. 完整事件清单

`eventBus.js` 的 `EVENT_TYPES`：

| 模块 | CRUD 事件 | 领域事件 |
|------|-----------|----------|
| 订单 order | created / updated / deleted | `order.transitioned` |
| 客户 customer | created / updated / deleted | `customer.followed` |
| 供应商 supplier | created / updated / deleted | — |
| 订舱 booking | created / updated / deleted | `booking.shipped` |
| 报关 customs | created / updated / deleted | — |
| 单证 document | created / updated / deleted | `document.generated` |
| 财务 finance | created / updated / deleted | `finance.billed` |
| 报价 quotation | created / updated / deleted | `quotation.confirmed` / `quotation.converted` |
| 跟踪 track | created / updated / deleted | — |
| 系统 | — | `alert.created` / `alert.resolved` / `automation.executed` / `user.login` |

> CRUD 事件由 baseController 对 `crudController({ name })` 的模块自动发射，payload 为 `{ id, data, user }`。

## 3. 订阅放哪里

**在启动阶段注册监听最稳妥**（进程生命周期只注册一次），两种方式：

1. 直接写进 `src/server.js` 启动阶段
2. 更规范：写成插件，在插件 `routes` 挂载时注册（见 [插件协议](/dev/plugins) 的 subscribe 模式）

> 官方插件 `notification` 就是「事件订阅 → 企微 Webhook」的标准范本，直接照抄改写即可。

## 4. 谁在消费（了解即可）

- `alertService`：`order.created/updated` → 即时触发规则扫描
- `automationService`：`booking.shipped` → 自动推进节点；`customs.created` → 推进报关；`order.created` → 自动生成应收
- `notification` 插件：事件 → 企微 Webhook 推送

## 5. 纪律

- **必须容错**：事件处理器抛错会被捕获记日志，不影响主流程——但你自己也要 try/catch，避免静默失败
- **幂等优先**：handler 内用 `dedupKey` / 状态判断防重复执行
- **不要 emit 卡死主流程**：能 `onAsync` 就用 `onAsync`

## 下一步

[外部对接适配器](/dev/adapters) —— 对接一家新的外部服务商。