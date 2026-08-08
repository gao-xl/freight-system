---
title: 二开哲学
prev: /guide/concepts
next: /dev/quickstart
---

# 二开哲学

> 定制需求 **80% 应通过「加一个文件 / 加一条配置」完成，不碰核心**。这是本系统与其他货代软件最本质的区别。

## 三条铁律

1. **配置 > 代码**：能 Web UI 配的（字段/规则/流程/模板/报表）不写代码
2. **扩展点不动核心**：需要代码时，优先用事件/适配器/插件，不修改核心文件
3. **新增不覆盖**：二开产物放 `backend/src/modules/<你的插件>/`，升级系统不冲突

## 五条路径（按成本从低到高）

| 需求 | 路径 | 入口 |
|------|------|------|
| 业务表单加字段 | 自定义字段 | 系统 → 自定义字段（无需改代码） |
| 业务异常自动预警 | 业务规则 | 系统 → 业务规则（表达式白名单） |
| 状态流转规则调整 | 流程配置 | 系统 → 流程配置 |
| 订单创建后推送/联动 | 事件订阅 | `events.onAsync('order.created', ...)` |
| 全新业务模块 | 插件 | `src/modules/<name>/index.js` |

## 为什么这样设计

系统的扩展体系是**分层**的，越往上越省事：

```
┌─────────────────────────────────────────────┐
│  配置层（Web UI，零代码）                     │
│  自定义字段 / 业务规则 / 流程 / 模板 / 报表    │
├─────────────────────────────────────────────┤
│  挂接层（少量代码，不改核心）                 │
│  事件订阅 / 外部适配器                        │
├─────────────────────────────────────────────┤
│  插件层（独立模块，可启停）                   │
│  ModuleRegistry 协议                        │
├─────────────────────────────────────────────┤
│  核心层（一般不要动）                        │
│  控制器 / 路由 / 核心服务                    │
└─────────────────────────────────────────────┘
```

**原则**：能在上层解决的，绝不动下层。只有上层确实表达不了的需求（改状态机默认逻辑、改派生逻辑），才需要碰核心，且要理解设计后再动（见下文）。

## 事件订阅示例（订单创建后推送 Webhook）

```js
// backend/src/modules/my-webhook/index.js
module.exports = {
  name: 'my-webhook',
  title: '我的 Webhook',
  routes(router, mw) {
    router.get('/my-webhook/config', mw.guard('integration', 'read'), async (req, res) => {
      res.json({ ok: true });
    });
  },
  // 订阅在路由挂载时注册（见官方插件 notification 的 subscribe())
};
```

官方可运行范本见 `backend/src/modules/notification/` 与 `backend/src/modules/qingdao-port/`。

## 常见坑

- **别绕过 scopedWhere**：新接口直接 `Model.findAll({ where: req.query })` 会绕过数据隔离
- **别直接改 `alertService` 核心规则**：用业务规则引擎加新规则，或用事件订阅
- **别硬编码密钥**：适配器密钥一律存 `IntegrationConfig` 表
- **单文件 ≤ 300 行**：控制器逻辑下沉 service，保持可读

## 什么时候可以碰核心

只有两种情况需要谨慎地改核心代码，且改前必读相关控制器：

1. 改**状态机默认派生逻辑** —— 先读 `controllers/orderController.js` 的 `computeReached / deriveOrderStatus`，订单状态是从子模块「派生」的，理解这个设计再动手。
2. 改**核心 CRUD 行为** —— 先确认 `baseController.js` 的 `crudController` 工厂确实无法通过配置项 `beforeWrite / protectedFields / scoped` 表达。

> 除此之外的需求，都应能落到上面五条路径之一。若不确定，先在 [事件订阅](/dev/events) 和 [插件协议](/dev/plugins) 里找找有没有现成挂接点。

## 下一步

进入 [自定义字段](/dev/custom-fields)，体验「零代码」定制一个字段。