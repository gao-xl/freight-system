'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// notification 模块（出站通知）
//
// 关系说明（E2 正式化后）：
//   - 事件驱动的出站推送（邮件 / 企微 Webhook / 通用 Webhook）已正式化为内置服务
//     src/services/notificationService.js，由 server.js 在启动时订阅事件，统一落库 NotificationRecord。
//   - 本模块保留为「配置/兼容 + 记录查询」面：
//       1. 企微 Webhook 配置入口（IntegrationConfig code=wechat_webhook），
//          notificationService 在未配 WECHAT_WEBHOOK 环境变量时回退读取该配置 → 单一路径，不两套并存。
//       2. 手动测试发送：POST /plugins/notification/test → 委托 notificationService.sendTest。
//       3. 推送记录查询：GET /api/notifications（管理端）。
//   - 本模块不再自行订阅事件（避免与内置服务重复推送）。
// ─────────────────────────────────────────────────────────────────────────────

const { logger } = require('../../utils/logger');
const notificationService = require('../../services/notificationService');
const notificationController = require('../../controllers/notificationController');

// 配置键（存在 IntegrationConfig 表，code 固定）
const CONFIG_CODE = 'wechat_webhook';

// 本模块声明关注的事件（供注册表展示；实际订阅由 notificationService 统一完成）
const SUBSCRIBED_EVENTS = ['alert.created', 'alert.resolved'];

// 读取通知配置（IntegrationConfig 里 code 对应行；未配置时返回 null）
async function getConfig() {
  const { IntegrationConfig } = require('../../models');
  const row = await IntegrationConfig.findOne({ where: { code: CONFIG_CODE } });
  if (!row) return null;
  try {
    return {
      enabled: row.enabled !== false,
      webhookUrl: row.apiKey, // 复用 apiKey 列存 Webhook URL（示例：不新增字段）
      remark: row.remark || '',
    };
  } catch {
    return null;
  }
}

// 保存通知配置（幂等 upsert）
async function saveConfig({ webhookUrl, enabled = true, remark = '' }) {
  const { IntegrationConfig } = require('../../models');
  // P2-4 修复：findOrCreate 返回 [row, created]，新建时 defaults 已写入，无需再 update；仅已存在时更新
  const [row, created] = await IntegrationConfig.findOrCreate({
    where: { code: CONFIG_CODE },
    defaults: { name: '企微 Webhook 通知', type: 'webhook', authType: 'api_key', apiKey: webhookUrl || '', enabled, remark },
  });
  if (!created) {
    await row.update({ apiKey: webhookUrl || row.apiKey, enabled, remark: remark || row.remark });
  }
  return getConfig();
}

// 模块定义（ModuleRegistry 协议）
module.exports = {
  name: 'notification',
  title: '出站通知（配置/兼容 + 推送记录）',
  dependencies: ['customer'],
  events: SUBSCRIBED_EVENTS,

  // 路由：自身配置接口 + 推送记录查询。用 mw.guard 拿权限守卫（核心自动注入）
  routes(router, mw = {}) {
    const guard = mw.guard || ((p) => (req, res, next) => next()); // 无守卫时放行
    const { ok, fail, asyncHandler } = require('../../utils/response');

    // GET /plugins/notification/config
    router.get('/plugins/notification/config', guard('integration', 'read'), asyncHandler(async (req, res) => {
      ok(res, await getConfig());
    }));

    // PUT /plugins/notification/config  { webhookUrl, enabled, remark }
    router.put('/plugins/notification/config', guard('integration', 'update'), asyncHandler(async (req, res) => {
      const { webhookUrl, enabled, remark } = req.body;
      if (!webhookUrl) return fail(res, 'webhookUrl 必填', 1, 400);
      ok(res, await saveConfig({ webhookUrl, enabled, remark }), '通知配置已保存');
    }));

    // POST /plugins/notification/test  { content? }  手动测试推送（委托内置服务，支持 email/wechat_webhook/webhook）
    router.post('/plugins/notification/test', guard('integration', 'update'), asyncHandler(async (req, res) => {
      const channel = req.body?.channel || 'wechat_webhook';
      const r = await notificationService.sendTest({ channel, content: req.body?.content });
      if (r.skipped) return fail(res, `渠道 ${channel} 未配置或未启用，请先配置`, 1, 400);
      if (!r.sent) return fail(res, `推送失败: ${r.error || '未知错误'}`, 1, 400);
      ok(res, null, '测试推送成功');
    }));

    // E2 推送记录查询（管理端）：GET /notifications?page=1&pageSize=20&eventType=&channel=&status=
    // 用 system:*（已注册权限点）而非 system:read（未注册，导致非 admin 角色永远无法被授权）
    router.get('/notifications', guard('system', '*'), notificationController.list);

    logger.info('[NOTIFY] 事件订阅由内置 notificationService 统一负责（server.js 启动时注册），本模块仅提供配置与记录查询');
  },

  services: { getNotifyConfig: getConfig, sendNotify: (content) => notificationService.sendTest({ channel: 'wechat_webhook', content }) },
};
