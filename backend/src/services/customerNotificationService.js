'use strict';

// P2-4 客户通知推送（订阅制，面向客户自助门户）
// -----------------------------------------------------------------
// 与 E2 面向内部员工的告警推送不同，本服务按「客户 × 事件类别 × 渠道」的
// PortalSubscription 偏好，把订单/跟踪/账单/报关等事件下发给客户自己：
//   - email      向客户档案邮箱（或订阅指定的 email）发送邮件
//   - wechat_mp  微信订阅号模板消息（公众号），配置见 WECHAT_MP_*（fail-open）
//
// 触发思路：订阅一组领域事件，事件并不都携带 customerId，故先做「该类别是否有
// 任何启用订阅」的轻量预检（内存缓存 30s），命中才做 customerId 解析与分发，
// 避免无关事件每次都打 DB。
//
// 失败策略：任一渠道发送失败仅记录 NotificationRecord(status=failed) 与日志，
// 绝不抛错影响主流程（与 E2 一致）。

const config = require('../config');
const { PortalSubscription, Customer, Order, Booking, FinanceRecord, CustomsDeclaration, NotificationRecord, IntegrationConfig } = require('../models');
const { logger } = require('../utils/logger');
const { Op } = require('sequelize');

// 客户侧事件类别（与前端订阅矩阵一致）
const CATEGORIES = ['order', 'track', 'bill', 'customs'];
// 可用客户渠道
const CUSTOMER_CHANNELS = ['email', 'wechat_mp'];

// 事件 → 类型
const CATEGORY_MAP = {
  'order.created': 'order',
  'order.updated': 'order',
  'order.transitioned': 'order',
  'booking.shipped': 'track',
  'track.created': 'track',
  'finance.created': 'bill',
  'finance.updated': 'bill',
  'customs.submitted': 'customs',
  'customs.status': 'customs',
};

const FETCH_TIMEOUT_MS = 10000;
function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ---------- 预检：某类别是否存在已启用的订阅（内存缓存，防无关事件频繁打库） ----------
let enabledCache = { stamp: 0, set: new Set() };
async function enabledCategories() {
  const now = Date.now();
  if (now - enabledCache.stamp < 30000) return enabledCache.set;
  const rows = await PortalSubscription.findAll({
    attributes: ['category'],
    where: { enabled: true },
    group: ['category'],
  });
  enabledCache = { stamp: now, set: new Set(rows.map((r) => r.category)) };
  return enabledCache.set;
}
// 订阅偏好写入后调用，强制下一轮重新读取预检集合
function invalidateEnabledCache() {
  enabledCache = { stamp: 0, set: new Set() };
}

// ---------- customerId 解析（各事件 payload 结构不同） ----------
async function resolveCustomerId(eventType, env) {
  const p = env && env.payload ? env.payload : env || {};
  try {
    if (eventType === 'order.created') {
      if (p.customerId) return p.customerId;
      const order = await Order.findByPk(p.orderId || p.id);
      return order ? order.customerId : null;
    }
    if (eventType.startsWith('order')) {
      const order = await Order.findByPk(p.orderId || p.id);
      return order ? order.customerId : null;
    }
    if (eventType.startsWith('booking')) {
      const booking = await Booking.findByPk(p.bookingId || p.id);
      if (!booking) return null;
      const order = await Order.findByPk(booking.orderId);
      return order ? order.customerId : null;
    }
    if (eventType.startsWith('finance')) {
      const finId = p.id || (p.data && p.data.id) || p.financeId;
      const fin = await FinanceRecord.findByPk(finId);
      if (!fin) return null;
      const order = await Order.findByPk(fin.orderId);
      return order ? order.customerId : null;
    }
    if (eventType.startsWith('customs')) {
      const decl = await CustomsDeclaration.findByPk(p.declId || p.id);
      if (!decl) return null;
      const order = await Order.findByPk(decl.orderId);
      return order ? order.customerId : null;
    }
    // track.created：payload 通常带 orderId
    if (eventType.startsWith('track')) {
      const order = await Order.findByPk(p.orderId);
      return order ? order.customerId : null;
    }
  } catch (e) {
    logger.warn(`[CNOTIFY] customerId 解析失败 ${eventType}`, { message: e.message });
  }
  return null;
}

// ---------- 微信订阅号模板消息 ----------
let tokenCache = { token: '', expireAt: 0 };
async function resolveWechatMp() {
  const n = config.notification || {};
  let appId = n.wechatMpAppId, secret = n.wechatMpSecret;
  // 兼容 IntegrationConfig(code=wechat_mp) 托管配置（env 未配时回退读库，存于 config JSON）
  if (!appId || !secret) {
    try {
      const row = await IntegrationConfig.findOne({ where: { code: 'wechat_mp' } });
      if (row) {
        let extra = {};
        try { extra = JSON.parse(row.config || '{}'); } catch { extra = {}; }
        if (!appId) appId = row.apiKey || extra.appId || '';
        if (!secret) secret = extra.secret || '';
        if (!n.wechatMpTemplate) n.wechatMpTemplate = extra.template || n.wechatMpTemplate;
        if ((!n.wechatMpOpenIds || !n.wechatMpOpenIds.length) && extra.openIds) n.wechatMpOpenIds = extra.openIds;
      }
    } catch { /* 读库失败按缺配置处理 */ }
  }
  if (!appId || !secret || n.wechatMpEnabled === false) return null;
  return { appId, secret, template: n.wechatMpTemplate || '', openIds: n.wechatMpOpenIds || [] };
}

async function getAccessToken(cfg) {
  if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.secret)}`;
  const res = await fetchWithTimeout(url);
  const body = await res.json();
  if (!body.access_token) throw new Error(`微信 access_token 获取失败: ${body.errcode || ''} ${body.errmsg || ''}`);
  tokenCache = { token: body.access_token, expireAt: Date.now() + (Number(body.expires_in) || 7200) * 1000 - 120000 };
  return body.access_token;
}

function buildTemplateData(eventType, payload) {
  const p = payload && payload.payload ? payload.payload : payload || {};
  const title = eventType.replace('.', '_');
  const first = {
    'order.created': '新订单已创建',
    'order.updated': '订单信息已更新',
    'order.transitioned': '订单状态已变更',
    'booking.shipped': '订舱已装船',
    'track.created': '货物跟踪有新动态',
    'finance.created': '有一笔新账单',
    'finance.updated': '账单已更新',
    'customs.submitted': '报关单已申报',
    'customs.status': '报关状态更新',
  }[eventType] || '货代系统通知';
  const desc = [
    p.orderNo ? `订单号：${p.orderNo}` : '',
    p.from && p.to ? `状态变更：${p.from} → ${p.to}` : '',
    p.amount ? `金额：${p.amount}` : '',
    p.route ? `航线：${p.route}` : '',
    p.message ? String(p.message).slice(0, 60) : '',
  ].filter(Boolean).join('\n') || '点击登录客户门户查看详情';
  return { first, keyword1: { value: title }, keyword2: { value: p.orderNo || String(p.orderId || p.id || '') }, remark: { value: desc.slice(0, 100) } };
}

async function sendWechatMp(cfg, eventType, payload) {
  if (!cfg.openIds || !cfg.openIds.length) throw new Error('未配置微信收件 openid（WECHAT_MP_OPENIDS）');
  if (!cfg.template) throw new Error('未配置微信模板 ID（WECHAT_MP_TEMPLATE）');
  const token = await getAccessToken(cfg);
  const data = buildTemplateData(eventType, payload);
  const failures = [];
  for (const openid of cfg.openIds) {
    const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, template_id: cfg.template, data }),
    });
    const body = await res.json();
    if (body.errcode !== 0) failures.push(`${openid}:${body.errcode}`);
  }
  if (failures.length === cfg.openIds.length) throw new Error(`微信模板消息全部下发失败 ${failures.join(',')}`);
  return { sent: cfg.openIds.length - failures.length, total: cfg.openIds.length };
}

// ---------- 邮件 ----------
const { decryptSecret } = require('../utils/crypto');
async function resolveSmtp() {
  const n = config.notification || {};
  let host = n.smtpHost, port = n.smtpPort || 465, user = n.smtpUser || '', pass = n.smtpPass || '', from = n.smtpFrom || '';
  try {
    const profile = await require('../models').CompanyProfile.findOne();
    if (profile && profile.smtpHost) {
      host = profile.smtpHost; port = profile.smtpPort || port; user = profile.smtpUser || user;
      pass = decryptSecret(profile.smtpPassEnc) || pass; from = profile.smtpFrom || from;
    }
  } catch { /* 读库失败回退 env */ }
  if (!host || n.smtpEnabled === false) return null;
  return { host, port: port || 465, user, pass, from: from || (user ? `货代系统 <${user}>` : '') };
}

async function sendEmail(cfg, to, { subject, text }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: Number(cfg.port) === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({ from: cfg.from, to, subject, text });
}

function buildEmailText(eventType, payload) {
  const p = payload && payload.payload ? payload.payload : payload || {};
  const lines = [
    `【货代系统】${buildTemplateData(eventType, p).first}`,
    `时间：${new Date().toISOString()}`,
    p.orderNo ? `订单号：${p.orderNo}` : '',
    p.from && p.to ? `状态：${p.from} → ${p.to}` : '',
    p.amount ? `金额：${p.amount}` : '',
    p.message ? `详情：${p.message}` : '',
    `---`,
    `登录客户门户查看详情。`,
  ].filter(Boolean);
  return lines.join('\n');
}

// ---------- 分发 ----------
async function record(category, customerId, eventType, channel, status, error, payload) {
  try {
    const p = payload && payload.payload ? payload.payload : payload;
    const summary = {
      category, orderNo: p ? p.orderNo : undefined,
      orderId: p ? (p.orderId || p.id) : undefined,
      from: p ? p.from : undefined, to: p ? p.to : undefined, amount: p ? p.amount : undefined,
    };
    await NotificationRecord.create({
      eventType, targetType: 'customer', targetId: customerId,
      channel, status, error: error ? String(error).slice(0, 500) : null,
      payload: JSON.stringify(summary).slice(0, 2000), sentAt: new Date(),
    });
  } catch (e) {
    logger.error('[CNOTIFY] 推送记录落库失败', { message: e.message });
  }
}

// 对单个客户的关键事件按订阅分发（事件服务内部调用）
async function dispatchToOne(customerId, category, eventType, payload) {
  const subs = await PortalSubscription.findAll({
    where: { customerId, category: { [Op.in]: Array.isArray(category) ? category : [category] }, enabled: true },
  });
  if (!subs.length) return [];
  const customer = await Customer.findByPk(customerId, { attributes: ['id', 'name', 'email', 'contact'] });
  const results = [];
  const smtp = await resolveSmtp();
  const mp = await resolveWechatMp();
  for (const sub of subs) {
    try {
      if (sub.channel === 'email') {
        if (!smtp) continue;
        const to = sub.email || (customer && customer.email) || '';
        if (!to) continue;
        await sendEmail(smtp, to, { subject: `【货代系统】${buildTemplateData(eventType, payload).first}`, text: buildEmailText(eventType, payload) });
        await record(category, customerId, eventType, 'email', 'sent', null, payload);
      } else if (sub.channel === 'wechat_mp') {
        if (!mp) continue;
        await sendWechatMp(mp, eventType, payload);
        await record(category, customerId, eventType, 'wechat_mp', 'sent', null, payload);
      }
      results.push({ channel: sub.channel, category: sub.category, status: 'sent' });
    } catch (e) {
      await record(category, customerId, eventType, sub.channel, 'failed', e.message, payload);
      logger.warn(`[CNOTIFY] ${sub.channel} 客户推送失败 ${eventType}`, { message: e.message });
      results.push({ channel: sub.channel, category: sub.category, status: 'failed', error: e.message });
    }
  }
  return results;
}

// 事件入口：统一解析 customerId 后分发（全程兜底，绝不让监听器抛未处理 rejection）
async function handleEvent(eventType, env) {
  try {
    const category = CATEGORY_MAP[eventType];
    if (!category) return;
    const enabled = await enabledCategories();
    if (!enabled.has(category)) return; // 该类别无人订阅，直接跳过（零查询）
    const customerId = await resolveCustomerId(eventType, env);
    if (!customerId) return;
    await dispatchToOne(customerId, category, eventType, env.payload || env);
  } catch (e) {
    logger.warn(`[CNOTIFY] 事件 ${eventType} 分发异常`, { message: e.message });
  }
}

let subscribed = false;
function subscribe() {
  if (subscribed) return;
  const events = require('./eventBus');
  for (const ev of Object.keys(CATEGORY_MAP)) {
    events.onAsync(ev, (env) => handleEvent(ev, env));
  }
  subscribed = true;
  logger.info(`[CNOTIFY] 客户订阅通知监听已注册：${Object.keys(CATEGORY_MAP).length} 个事件`);
}

module.exports = {
  CATEGORIES, CUSTOMER_CHANNELS, subscribe, invalidateEnabledCache, dispatchToOne,
  resolveCustomerId, enabledCategories,
};