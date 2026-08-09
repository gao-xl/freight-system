# 官方示例插件

本目录两个插件是「模块注册协议」（`src/core/moduleRegistry.js`）的可运行范本，对应《二开指南》recipe 3「写插件」。

## 插件 1：notification（出站通知）

**演示能力**：插件作为「配置/兼容 + 推送记录」面，出站推送由内置服务统一完成

- E2 正式化后，事件驱动的出站推送（邮件 / 企微 Webhook / 通用 Webhook）由内置服务
  `src/services/notificationService.js` 负责：订阅 `alert.created` / `alert.resolved`（预警产生即推送，
  与 E1 自动拉取联动），推送结果落库 `NotificationRecord`。
- 本模块保留：
  - 企微 Webhook 配置入口：`IntegrationConfig` 表（code=`wechat_webhook`），内置服务在未配
    `WECHAT_WEBHOOK` 环境变量时回退读取该配置（单一路径，不两套并存）
  - `GET  /api/plugins/notification/config` 查看配置
  - `PUT  /api/plugins/notification/config` 保存配置 `{ webhookUrl, enabled, remark }`
  - `POST /api/plugins/notification/test` 手动测试推送（委托内置服务，支持 `channel: email|wechat_webhook|webhook`）
  - `GET  /api/notifications` 推送记录查询（管理端）
- 开关：渠道缺配置/未启用时静默跳过，不影响主流程；推送失败仅记日志与记录（status=failed），绝不抛错影响业务
- 环境变量方式：也可直接在 `.env` 配 `WECHAT_WEBHOOK` / `SMTP_*` / `WEBHOOK_URL`（见 `.env.example`）

**启用步骤（企微）**：
1. 注册一个企业微信群机器人，拿到 Webhook URL
2. `PUT /api/plugins/notification/config` 写入 URL 并 `enabled: true`
3. 触发一条预警（如运行规则扫描），企微群即收到预警推送，`GET /api/notifications` 可查记录

## 插件 2：qingdao-port（青岛港专项）

**演示能力**：存量业务升级为插件（models + routes + menu + events 收拢）

- 从 `routes/index.js` 迁出 5 个青岛港端点，改由插件 `mountRoutes` 自动挂载
- 专属模型：`QingdaoNode` / `YardRecord` / `YardMeta`
- 前端菜单：青岛港看板
- 事件：`qingdao.node_updated`

**与核心的关系**：核心发行版保持港口中立；青岛港作为示例插件随仓库提供，按需启用（对应执行总纲决策 4）。

## 怎么抄

```js
// backend/src/modules/<your-plugin>/index.js
module.exports = {
  name: 'your-plugin',          // 必填，与目录名一致
  title: '我的插件',
  dependencies: ['order'],      // 前置模块
  models: [MyModel],            // 插件专属模型
  routes(router, mw) {          // mw.guard = 权限守卫（核心注入）
    router.get('/my-plugin/x', mw.guard('order', 'read'), handler);
  },
  services: { myService },      // 暴露服务
  seed: async () => {},         // 初始化数据
  menu: { path: '/my-plugin', icon: 'Box', permission: 'order:read' },
  events: ['my-plugin.updated'],
};
```

放进目录即可被 `ModuleRegistry.load` 自动发现；`mountRoutes` 自动挂载路由（`autoMount: false` 的存量模块除外）。
