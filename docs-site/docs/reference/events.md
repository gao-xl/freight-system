# 事件总线

`backend/src/services/eventBus.js` —— 全进程单例，写操作自动发射事件。

## 自动发射（baseController）

| 事件 | 触发 |
|------|------|
| `{module}.created` | 创建（如 `customer.created`） |
| `{module}.updated` | 更新 |
| `{module}.deleted` | 删除 |

## 业务事件

| 事件 | 说明 |
|------|------|
| `order.created / updated` | 订单创建/更新（payload 含 orderId/orderNo） |
| `order.transitioned` | 订单状态流转（payload 含 from/to/rule） |
| `booking.shipped` | 订舱装船 |
| `finance.created / updated` | 财务记录 |
| `alert.created` | 预警产出 |
| `qingdao.node_updated` | 青岛港节点更新（插件） |

## 订阅

```js
const events = require('./services/eventBus');

// 同步
events.on('order.created', (payload) => { /* ... */ });
// 异步（可 await，不阻塞事件循环）
events.onAsync('order.created', async (payload) => { /* ... */ });
```

## 谁在消费

- `alertService`：订单/财务/订舱变更 → 即时触发规则扫描
- `automationService`：订舱发船/报关放行 → 自动推进节点
- `notification` 插件：事件 → 企微 Webhook 推送（官方示例）

## 注意

- 事件处理器必须容错：抛错会被捕获记日志，不影响主流程
- 幂等优先：handler 内用 dedupKey / 状态判断防重复执行
