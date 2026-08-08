# 官方示例插件

仓库 `backend/src/modules/` 内置两个可运行插件，是「照着抄」的范本。

## notification —— 事件订阅 + 企微 Webhook

演示：事件总线订阅 → 出站通知，不改核心代码。

```
事件(order.created/booking.shipped/finance.created/alert.created)
   └─► 读配置(IntegrationConfig 表)
        └─► 企业微信机器人 Webhook 推送
```

接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plugins/notification/config` | 查看配置 |
| PUT | `/api/plugins/notification/config` | 保存 `{ webhookUrl, enabled, remark }` |
| POST | `/api/plugins/notification/test` | 手动测试推送 |

启用：注册企微机器人 → 保存 Webhook URL 并启用 → 建订单即可看到推送。

## qingdao-port —— 存量模块插件化

演示：把散落在 routes/index.js 的青岛港路由收拢为独立插件。

- 5 个 `/api/qingdao/*` 端点由插件挂载
- 专属模型 `QingdaoNode / YardRecord / YardMeta`
- 前端菜单「青岛港看板」
- 事件 `qingdao.node_updated`

核心发行版保持港口中立；此插件演示「按需启用增值能力」。

## 动手实验

1. 复制 `notification/` 为 `my-notify/`，改 name
2. 换一个事件名（如 `finance.updated`）
3. 重启后端，看日志 `[MODULE] 已注册模块: my-notify`
4. 触发事件，验证收到推送
