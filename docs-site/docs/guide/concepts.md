---
title: 核心概念
prev: /dev/index
next: /dev/philosophy
---

# 核心概念

## 一张图看懂系统

```
客户 ──► 报价 ──► 订单（中枢） ──► 订舱 ──► 报关
                                    │
                                    ├─► 运输跟踪（节点推进）
                                    ├─► 单证（模板引擎 + 套打）
                                    └─► 财务（应收/应付/核销/对账）
                                        │
                                        └─► 预警/自动化（规则引擎 + 动作引擎）
```

## 订单是中枢，状态是派生的

订单不手工维护一个「总状态」，而是由**业务数据的到达情况推导**：

- 有订舱 → `booked`
- 有关税单 → `customs`
- 跟踪节点到了 loaded → `loaded`
- 全部节点到达 → `completed`

推导函数 `computeReached / deriveOrderStatus` 是唯一事实来源（`backend/src/controllers/orderController.js`）。二开时不要另搞一套订单状态逻辑，去扩充分支条件即可。

## 数据隔离（dataScope）

多人团队按「小组 + 负责人」隔离行数据：

- `scope: all`（管理员/经理）：看全部
- `scope: group`：看本组
- `scope: self`（默认）：只看自己负责的

所有列表查询经 `scopedWhere`、单条操作经 `scopedFindOne` 自动注入，二开新接口必须走这两个辅助函数，否则会绕过隔离。

## 扩展点地图（二开核心）

| 层级 | 机制 | 做什么 |
|------|------|--------|
| 配置级 | 自定义字段 / 业务规则 / 流程配置 / 打印模板 / 报表定义 | 零代码定制 |
| 文件级 | CRUD 工厂 / 适配器 / 规则函数 / 事件监听 | 加一个文件/函数 |
| 插件级 | 模块注册协议 | 独立包，可启用卸载 |

## 事件总线

所有写操作（create/update/delete）自动发射事件：`order.created`、`finance.updated`……

订阅即可做自动化（不用改核心代码）：

```js
const events = require('./services/eventBus');
events.onAsync('order.created', async (payload) => {
  // 你的业务
});
```

完整事件清单见《[事件总线](../reference/events)》。
