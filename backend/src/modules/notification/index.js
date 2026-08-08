'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 官方示例插件 ①：notification（出站通知）
//
// 演示目标：不改核心代码，仅用「事件订阅 + 配置表」实现一个可用功能
//   —— 订单创建 / 订舱装船等事件发生时，自动向企业微信群机器人 Webhook 推送消息。
//
// 它是「写插件」recipe 的可运行范本，对应《二开指南》recipe 3：
//   1. 监听事件总线（events.onAsync('order.created', ...)）
//   2. 用 IntegrationConfig 表做开关与配置（不写死密钥）
//   3. 自身暴露 /plugins/notification/* 接口（读配置 / 测试发送）
//
// 用法（非技术文档见 docs/plugins/notification.md）：
//   - 管理员在「外部对接」里启用 code='wechat_webhook' 的集成并填 Webhook URL
//   - 或直接调 PUT /api/plugins/notification/config 存 { webhookUrl, enabled }
//   - 事件发生后自动推送；可用 POST /api/plugins/notification/test 验证
// ─────────────────────────────────────────────────────────────────────────────

const { logger } = require('../../utils/logger');

// 配置键（存在 IntegrationConfig 表，code 固定）
const CONFIG_CODE = 'wechat_webhook';

// 订阅的事件（可在 events 字段声明，注册表可查）
const SUBSCRIBED_EVENTS = ['order.created', 'booking.shipped', 'finance.created', 'alert.created'];

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
  const [row] = await IntegrationConfig.findOrCreate({ where: { code: CONFIG_CODE }, defaults: { name: '企微 Webhook 通知', type: 'webhook', authType: 'api_key', apiKey: webhookUrl || '', enabled, remark } });
  await row.update({ apiKey: webhookUrl || row.apiKey, enabled, remark: remark || row.remark });
  return getConfig();
}

// 实际发送：企业微信机器人 Webhook（POST JSON）
async function sendWebhook(webhookUrl, content) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: `[货代系统]\n${content}` },
    }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  const body = await res.json();
  if (body.errcode !== 0) throw new Error(`企微返回 errcode=${body.errcode} ${body.errmsg || ''}`);
  return body;
}

// 事件 → 消息文案
function formatMessage(eventName, payload = {}) {
  switch (eventName) {
    case 'order.created':
      return `新订单创建：${payload.orderNo || `#${payload.orderId}`}`;
    case 'booking.shipped':
      return `订舱已装船：订单 #${payload.orderId}${payload.bookingNo ? `（${payload.bookingNo}）` : ''}`;
    case 'finance.created':
      return `新财务记录：#${payload.financeId || payload.id || ''} ${payload.amount ? `金额 ${payload.amount}` : ''}`;
    case 'alert.created':
      return `【预警】${payload.title || '新预警'}：${payload.message || ''}`;
    default:
      return `事件 ${eventName}：${JSON.stringify(payload).slice(0, 120)}`;
  }
}

// 订阅处理：事件 → 读配置 → 推送（失败仅记日志，绝不抛错影响主流程）
function handleEvent(eventName) {
  return async (payload = {}) => {
    try {
      const cfg = await getConfig();
      if (!cfg || !cfg.enabled || !cfg.webhookUrl) return; // 未启用/未配置则静默跳过
      await sendWebhook(cfg.webhookUrl, formatMessage(eventName, payload));
      logger.info(`[NOTIFY] 已推送事件 ${eventName} 至企微`);
    } catch (e) {
      logger.error(`[NOTIFY] 推送失败 ${eventName}`, { message: e.message });
    }
  };
}

// 启动订阅（幂等：标记避免重复订阅）
let subscribed = false;
function subscribe() {
  if (subscribed) return;
  const events = require('../../services/eventBus');
  for (const ev of SUBSCRIBED_EVENTS) {
    events.onAsync(ev, handleEvent(ev));
  }
  subscribed = true;
  logger.info(`[NOTIFY] 已订阅事件: ${SUBSCRIBED_EVENTS.join(', ')}`);
}

// 模块定义（ModuleRegistry 协议）
module.exports = {
  name: 'notification',
  title: '出站通知（官方示例插件）',
  dependencies: ['customer'],
  events: SUBSCRIBED_EVENTS,

  // 路由：自身配置接口。用 mw.guard 拿权限守卫（核心自动注入）
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

    // POST /plugins/notification/test  { content? }  手动测试推送
    router.post('/plugins/notification/test', guard('integration', 'update'), asyncHandler(async (req, res) => {
      const cfg = await getConfig();
      if (!cfg || !cfg.webhookUrl) return fail(res, '请先配置 Webhook URL', 1, 400);
      if (!cfg.enabled) return fail(res, '通知未启用', 1, 400);
      try {
        await sendWebhook(cfg.webhookUrl, req.body?.content || '测试消息：通知插件工作正常');
        ok(res, null, '测试推送成功');
      } catch (e) {
        fail(res, `推送失败: ${e.message}`, 1, 400);
      }
    }));

    // 路由挂载后自动订阅事件（幂等）
    subscribe();
  },

  services: { getNotifyConfig: getConfig, sendNotify: sendWebhook },
};
