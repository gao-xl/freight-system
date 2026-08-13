'use strict';

// E2 通知推送服务（内置）
// ---------------------------------------------------------------
// 三种出站渠道，均由配置控制，缺配置/未启用即自动跳过（fail-open）：
//   - email          邮件（nodemailer + SMTP，SMTP_HOST 等）
//   - wechat_webhook 企业微信群机器人 Webhook（WECHAT_WEBHOOK，或兼容插件遗留 IntegrationConfig.code=wechat_webhook）
//   - webhook        通用 HTTP Webhook（WEBHOOK_URL）
//
// 触发：
//   - alert.created  / alert.resolved  预警产生/解除即推送（事件由 alertService/ruleEngineService 在写入时发射）
//   - 可选业务事件 NOTIFY_BUSINESS_EVENTS=order.created,order.transitioned 逗号分隔，按需订阅
//
// 记录：每次实际推送写 NotificationRecord（sent/failed）；推送异常仅记日志与记录，绝不抛错影响主流程。
// 配置说明见 .env.example（SMTP_* / WECHAT_WEBHOOK / WEBHOOK_URL / NOTIFY_*），默认无配置零副作用。

const config = require('../config');
const { NotificationRecord, IntegrationConfig } = require('../models');
const { logger } = require('../utils/logger');

const CHANNELS = ['email', 'wechat_webhook', 'webhook'];
// P2-1 修复：出站 fetch 统一加 10s 超时，防止 Webhook URL 挂起导致 promise 长期悬挂/内存累积
const FETCH_TIMEOUT_MS = 10000;
async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 渠道配置解析：未配置/不可用返回 null（调用方静默跳过）
async function resolveChannel(channel) {
  const n = config.notification || {};
  if (channel === 'email') {
    const host = n.smtpHost;
    if (!host) return null;
    return {
      enabled: n.smtpEnabled !== false,
      host,
      port: n.smtpPort || 465,
      user: n.smtpUser || '',
      pass: n.smtpPass || '',
      from: n.smtpFrom || (n.smtpUser ? `货代系统 <${n.smtpUser}>` : ''),
      to: n.emailTo || '',
    };
  }
  if (channel === 'wechat_webhook') {
    let url = n.wechatWebhook || '';
    // 兼容既有 notification 插件：环境变量未配置时回退读 IntegrationConfig(code=wechat_webhook).apiKey
    if (!url) {
      try {
        const row = await IntegrationConfig.findOne({ where: { code: 'wechat_webhook' } });
        url = row && row.apiKey ? row.apiKey : '';
      } catch {
        url = '';
      }
    }
    if (!url) return null;
    return { enabled: n.wechatEnabled !== false, url };
  }
  if (channel === 'webhook') {
    const url = n.webhookUrl || '';
    if (!url) return null;
    return { enabled: n.webhookEnabled !== false, url };
  }
  return null;
}

// ── 各渠道实际发送（抛错由调用方捕获） ──

async function sendEmail(cfg, { subject, text }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: Number(cfg.port) === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({ from: cfg.from, to: cfg.to, subject, text });
}

async function sendWechat(cfg, content) {
  const res = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content } }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  const body = await res.json();
  if (body.errcode !== 0) throw new Error(`企微返回 errcode=${body.errcode} ${body.errmsg || ''}`);
  return body;
}

async function sendGenericWebhook(cfg, { eventType, payload }) {
  const res = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: eventType,
      time: new Date().toISOString(),
      data: payload,
      source: 'freight-system',
    }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  return res.json();
}

async function sendChannel(channel, cfg, eventType, payload) {
  if (channel === 'email') {
    const { subject, text } = buildEmail(eventType, payload);
    return sendEmail(cfg, { subject, text });
  }
  if (channel === 'wechat_webhook') {
    return sendWechat(cfg, formatMessage(eventType, payload));
  }
  if (channel === 'webhook') {
    return sendGenericWebhook(cfg, { eventType, payload });
  }
  throw new Error(`未知渠道 ${channel}`);
}

// ── 文案 ──

// 事件 → 企微/站内文本（envelope 与裸 payload 双兼容）
function formatMessage(eventType, payload = {}) {
  const p = payload && payload.payload ? payload.payload : payload;
  switch (eventType) {
    case 'alert.created':
      return `【预警】${p.title || '新预警'}：${p.message || ''}`;
    case 'alert.resolved':
      return `【预警已解除】${p.title || ''}`;
    case 'order.created':
      return `新订单创建：${p.orderNo || `#${p.orderId || p.id || ''}`}`;
    case 'order.transitioned':
      return `订单状态变更：#${p.orderId || p.id || ''}${p.from && p.to ? ` ${p.from} → ${p.to}` : ''}`;
    case 'finance.created':
      return `新财务记录：#${p.financeId || p.id || ''}${p.amount ? ` 金额 ${p.amount}` : ''}`;
    case 'backup.completed':
      return `【备份完成】${p.label === 'monthly' ? '月度自动备份' : '备份'}成功：${p.filename || ''}（${p.sizeText || p.size || ''}）`;
    case 'backup.failed':
      return `【备份失败】${p.label === 'monthly' ? '月度自动备份' : '系统备份'}执行失败，请立即检查：${String(p.message || '').slice(0, 200)}`;
    case 'backup.overdue':
      return `【备份超期】${p.message || `已 ${Math.floor(p.ageDays || 0)} 天未备份，请尽快备份`}`;
    default:
      return `事件 ${eventType}：${JSON.stringify(p).slice(0, 120)}`;
  }
}

function buildEmail(eventType, payload) {
  const p = payload && payload.payload ? payload.payload : payload;
  const subject = `【货代系统】${eventType === 'alert.created' ? `预警：${p.title || ''}` : `事件通知：${eventType}`}`;
  const lines = [
    `事件：${eventType}`,
    `时间：${new Date().toISOString()}`,
    '',
    p.title ? `标题：${p.title}` : '',
    p.message ? `详情：${p.message}` : '',
    p.orderNo ? `订单号：${p.orderNo}` : '',
    p.alertId ? `预警 ID：${p.alertId}` : '',
    `原始数据：${JSON.stringify(p).slice(0, 800)}`,
  ].filter(Boolean);
  return { subject, text: lines.join('\n') };
}

function payloadSummary(payload) {
  const p = payload && payload.payload ? payload.payload : payload;
  if (!p || typeof p !== 'object') return { raw: String(p).slice(0, 300) };
  const { title, message, orderNo, type, level, alertId, orderId, id } = p;
  return { title, message, orderNo, type, level, alertId, orderId, id };
}

function inferTargetType(eventType) {
  const first = String(eventType).split('.')[0] || 'alert';
  if (first === 'alert') return 'alert';
  if (first === 'order') return 'order';
  if (first === 'finance') return 'finance';
  if (first === 'booking') return 'booking';
  return first;
}

function inferTargetId(eventType, payload) {
  const p = payload && payload.payload ? payload.payload : payload;
  if (!p || typeof p !== 'object') return null;
  if (eventType === 'alert.created' || eventType === 'alert.resolved') return p.alertId || p.id || null;
  return p.id || p.orderId || p.financeId || p.bookingId || null;
}

// ── 推送主流程 ──

// 对一次事件尝试全部已配置渠道；每个渠道独立记录结果；缺配置/失败均不抛致命错误
async function push({ eventType, targetType, targetId, payload }) {
  const results = [];
  for (const channel of CHANNELS) {
    let cfg;
    try {
      cfg = await resolveChannel(channel);
    } catch {
      cfg = null; // 配置读取异常也按缺配置处理
    }
    if (!cfg || cfg.enabled === false) continue; // 缺配置/未启用 → 静默跳过
    const rec = {
      eventType,
      targetType: targetType || inferTargetType(eventType),
      targetId: targetId || inferTargetId(eventType, payload),
      channel,
      status: 'sent',
    };
    try {
      await sendChannel(channel, cfg, eventType, payload);
    } catch (e) {
      rec.status = 'failed';
      rec.error = String(e.message || e).slice(0, 500);
      logger.warn(`[NOTIFY] ${channel} 推送失败 ${eventType}`, { message: e.message });
    }
    rec.payload = JSON.stringify(payloadSummary(payload)).slice(0, 2000);
    rec.sentAt = new Date();
    try {
      await NotificationRecord.create(rec);
    } catch (e) {
      logger.error('[NOTIFY] 推送记录落库失败', { message: e.message });
    }
    results.push(rec);
  }
  return results;
}

// ── 事件订阅 ──

let subscribed = false;
function subscribe() {
  if (subscribed) return;
  const events = require('./eventBus');
  // 预警产生/解除 → 立即推送（与 E1 自动拉取联动：拉取写入预警即触发）
  events.onAsync('alert.created', (env) => push({ eventType: 'alert.created', targetType: 'alert', targetId: (env.payload && env.payload.alertId) || null, payload: env.payload }));
  events.onAsync('alert.resolved', (env) => push({ eventType: 'alert.resolved', targetType: 'alert', targetId: (env.payload && env.payload.alertId) || null, payload: env.payload }));
  // 可选关键业务事件（NOTIFY_BUSINESS_EVENTS=order.created,order.transitioned ...）
  const extra = String((config.notification && config.notification.businessEvents) || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const ev of extra) {
    events.onAsync(ev, (env) => push({ eventType: ev, payload: env.payload }));
  }
  subscribed = true;
  logger.info(`[NOTIFY] 事件订阅已注册：alert.created, alert.resolved${extra.length ? `, ${extra.join(', ')}` : ''}`);
}

// 手动测试发送（供插件/管理端验证渠道连通性）；缺配置返回 { skipped: true }
async function sendTest({ channel, content }) {
  const cfg = await resolveChannel(channel);
  if (!cfg || cfg.enabled === false) return { skipped: true, channel };
  try {
    await sendChannel(channel, cfg, 'test.notification', { content: content || `测试消息：通知服务正常（${new Date().toISOString()}）` });
    return { sent: true, channel };
  } catch (e) {
    return { sent: false, channel, error: String(e.message || e) };
  }
}

// 记录查询（管理端）
async function listRecords({ eventType, channel, status, targetId, page = 1, pageSize = 50 } = {}) {
  const { Op } = require('sequelize');
  const where = {};
  if (eventType) where.eventType = eventType;
  if (channel) where.channel = channel;
  if (status) where.status = status;
  if (targetId) where.targetId = targetId;
  const { rows, count } = await NotificationRecord.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { list: rows, total: count };
}

module.exports = { CHANNELS, resolveChannel, push, subscribe, sendTest, listRecords, formatMessage };
