'use strict';

// P2-4 客户通知订阅偏好管理（客户自助门户）
// 订阅归属当前登录客户（req.user.customerId），禁止跨客户读写，保持与门户其余
// 只读接口一致的数据隔离。
const { PortalSubscription, Customer } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const customerNotify = require('../services/customerNotificationService');

const CATEGORIES = customerNotify.CATEGORIES;
const CHANNELS = customerNotify.CUSTOMER_CHANNELS;

// GET /api/portal/subscriptions
// 返回当前客户的订阅矩阵（category × channel → enabled + email），并附客户联系方式与可用渠道状态
const getSubscriptions = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const customer = await Customer.findByPk(customerId, { attributes: ['id', 'name', 'email', 'contact'] });
  const rows = await PortalSubscription.findAll({ where: { customerId } });
  const enabled = new Set(rows.filter((r) => r.enabled).map((r) => `${r.category}|${r.channel}`));
  const emailByCat = {};
  for (const r of rows) if (r.channel === 'email') emailByCat[r.category] = r.email || (customer && customer.email) || '';
  const matrix = CATEGORIES.map((category) => ({
    category,
    defaultEmail: customer ? (customer.email || '') : '',
    channels: CHANNELS.map((channel) => ({
      channel,
      enabled: enabled.has(`${category}|${channel}`),
      email: channel === 'email' ? (emailByCat[category] || (customer && customer.email) || '') : undefined,
    })),
  }));
  ok(res, { customer: { id: customerId, name: customer ? customer.name : '', email: customer ? customer.email : '', contact: customer ? customer.contact : '' }, matrix, categories: CATEGORIES, channels: CHANNELS });
});

// PUT /api/portal/subscriptions
// body: { items: [{ category, channel, enabled, email? }] }  仅可操作本客户；email 仅对 email 渠道生效
const upsertSubscriptions = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) return fail(res, 'body.items 必须为数组', 1, 400);
  if (!items.length) {
    // 空数组视为清空全部订阅
    await PortalSubscription.destroy({ where: { customerId } });
    customerNotify.invalidateEnabledCache();
    return ok(res, { updated: 0 }, '订阅已清空');
  }
  let updated = 0;
  for (const it of items) {
    const category = CATEGORIES.includes(it.category) ? it.category : null;
    const channel = CHANNELS.includes(it.channel) ? it.channel : null;
    if (!category || !channel) throw Object.assign(new Error(`非法订阅项 category/channel`), { status: 400 });
    await PortalSubscription.destroy({ where: { customerId, category, channel } });
    if (it.enabled) {
      await PortalSubscription.create({
        customerId, category, channel, enabled: true,
        email: channel === 'email' && it.email ? String(it.email).trim().slice(0, 120) : null,
      });
    }
    updated += 1;
  }
  customerNotify.invalidateEnabledCache();
  ok(res, { updated }, '订阅偏好已保存');
});

module.exports = { getSubscriptions, upsertSubscriptions };