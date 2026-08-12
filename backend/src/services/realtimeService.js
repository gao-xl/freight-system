// F5/F6 实时推送：SSE 长连接中心 + 事件驱动的统一消息落库与实时广播
//
// 职责：
//   1. SSE 长连接管理（按 userId 维护连接集合，心跳保活，优雅停机关闭）
//   2. 订阅 eventBus 关键业务事件 → 生成 MessageRecord（统一消息中心落库）
//   3. 同事件实时广播给所有在线客户端的 SSE 连接（前端据此刷新未读角标 / 弹提示）
//
// 鉴权说明：SSE 端点挂在 authRequired 之后，前端用 fetch + ReadableStream 携带
//   Authorization Bearer 实现（原生 EventSource 无法自定义 header）。
const { logger } = require('../utils/logger');

// 已订阅标记（防重复订阅）
let subscribed = false;
// userId -> Set<res>
const clients = new Map();

// 消息分类目录（与 MessageRecord.type / MessagePreference.type 对齐）
// 语义：默认全开（absence = 启用）；用户关闭某分类后不再为其生成该分类消息并停止实时提醒
const CATEGORIES = ['alert', 'order', 'finance', 'approval', 'system'];

// 事件 → 消息模板（title/content/ref）与分类；payload 为裸业务数据（envelope.payload）
const MESSAGE_EVENTS = {
  'alert.created': {
    type: 'alert',
    level: (p) => p.level || 'warning',
    title: (p) => p.title || '新预警',
    content: (p) => p.message || '',
    ref: (p) => ({ refType: 'alert', refId: p.alertId || p.id || null }),
  },
  'alert.resolved': {
    type: 'alert',
    level: () => 'info',
    title: (p) => `预警已解除${p.title ? `：${p.title}` : ''}`,
    content: () => '',
    ref: (p) => ({ refType: 'alert', refId: p.alertId || p.id || null }),
  },
  'order.created': {
    type: 'order',
    level: () => 'info',
    title: (p) => `新订单 ${p.orderNo || `#${p.orderId || p.id || ''}`}`,
    content: (p) => p.cargoDesc || (p.from ? `${p.from} → ${p.to || ''}` : ''),
    ref: (p) => ({ refType: 'order', refId: p.orderId || p.id || null }),
  },
  'order.transitioned': {
    type: 'order',
    level: () => 'info',
    title: (p) => `订单 ${p.orderNo || `#${p.orderId || p.id || ''}`} 状态变更`,
    content: (p) => (p.from && p.to ? `${p.from} → ${p.to}` : ''),
    ref: (p) => ({ refType: 'order', refId: p.orderId || p.id || null }),
  },
  'finance.created': {
    type: 'finance',
    level: () => 'info',
    title: (p) => `新财务记录 #${p.financeId || p.id || ''}`,
    content: (p) => (p.amount ? `金额 ${p.amount}` : ''),
    ref: (p) => ({ refType: 'finance', refId: p.financeId || p.id || null }),
  },
  'finance.billed': {
    type: 'finance',
    level: () => 'info',
    title: (p) => `财务已开票 #${p.invoiceId || p.id || ''}`,
    content: () => '',
    ref: (p) => ({ refType: 'finance', refId: p.invoiceId || p.id || null }),
  },
  'booking.shipped': {
    type: 'order',
    level: () => 'info',
    title: (p) => `订舱已装船 #${p.orderId || p.bookingId || ''}`,
    content: () => '',
    ref: (p) => ({ refType: 'order', refId: p.orderId || p.bookingId || null }),
  },
  'backup.completed': {
    type: 'system',
    level: () => 'info',
    title: (p) => `备份完成：${p.filename || ''}`,
    content: (p) => `${p.label === 'monthly' ? '月度自动备份' : '备份'}成功（${p.sizeText || p.size || ''}）`,
    ref: () => ({ refType: null, refId: null }),
  },
  'backup.failed': {
    type: 'system',
    level: () => 'warning',
    title: () => '备份失败，请立即处理',
    content: (p) => String(p.message || '').slice(0, 200),
    ref: () => ({ refType: null, refId: null }),
  },
  'backup.overdue': {
    type: 'system',
    level: () => 'warning',
    title: (p) => `备份超期：已 ${Math.floor(p.ageDays || 0)} 天未备份`,
    content: (p) => p.message || '请尽快执行备份',
    ref: () => ({ refType: null, refId: null }),
  },
};

// 兼容事件上报（SSE 广播但不落库，供前端感知操作类事件）
const BROADCAST_ONLY = ['user.login', 'automation.executed'];

function sseWrite(res, data) {
  if (res.writableEnded) return;
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) { /* 连接可能已断开 */ }
}

// SSE 心跳：防代理/负载均衡空闲断连
function startHeartbeat(res) {
  const timer = setInterval(() => {
    sseWrite(res, { type: 'heartbeat', time: new Date().toISOString() });
  }, 15000);
  res.once('close', () => clearInterval(timer));
}

// 注册一个 SSE 连接
function addClient(userId, res) {
  if (!userId) return;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

// 移除一个 SSE 连接
function removeClient(userId, res) {
  if (!userId) return;
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

// 广播给所有在线客户端
function broadcast(data) {
  for (const [userId, set] of clients) {
    for (const res of set) sseWrite(res, data);
  }
}

// SSE 端点 handler：GET /api/events/stream（已过 authRequired，req.user 可用）
function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 反代不缓冲
  });
  res.flushHeaders?.();
  // 初始连接确认
  sseWrite(res, { type: 'connected', userId: req.user?.id, time: new Date().toISOString() });
  const userId = req.user?.id;
  addClient(userId, res);
  startHeartbeat(res);
  req.on('close', () => removeClient(userId, res));
  req.on('error', () => removeClient(userId, res));
}

// 为单个业务事件：生成站内消息 + 实时广播
async function handleEvent(eventName, envelope) {
  const p = (envelope && envelope.payload) || {};
  const template = MESSAGE_EVENTS[eventName];

  // 实时广播（所有在线客户端）
  const frame = {
    type: 'event',
    event: eventName,
    time: envelope && envelope.time,
    payload: p,
  };
  broadcast(frame);

  // 落库统一消息（仅登记过的事件）
  if (!template) return;
  try {
    const { MessageRecord, User, MessagePreference } = require('../models');
    const users = await User.findAll({ where: { status: 'active' }, attributes: ['id'] });
    if (!users.length) return;
    // 订阅偏好过滤：用户关闭该分类则不再落库（absence=全开，单次查询避免 N+1）
    const disabled = await MessagePreference.findAll({
      where: { userId: users.map((u) => u.id), type: template.type, enabled: false },
      attributes: ['userId'],
    });
    const disabledIds = new Set(disabled.map((d) => d.userId));
    const ref = template.ref(p);
    const rows = users
      .filter((u) => !disabledIds.has(u.id))
      .map((u) => ({
        userId: u.id,
        type: template.type,
        level: template.level(p),
        title: String(template.title(p) || '').slice(0, 120),
        content: String(template.content(p) || '').slice(0, 500),
        refType: ref.refType,
        refId: ref.refId,
        isRead: false,
      }));
    if (!rows.length) return;
    await MessageRecord.bulkCreate(rows);
  } catch (e) {
    logger.error('[REALTIME] 消息落库失败', { event: eventName, message: e.message });
  }
}

// 订阅事件（server.js 启动时调用一次）
function subscribe() {
  if (subscribed) return;
  const events = require('./eventBus');
  for (const name of Object.keys(MESSAGE_EVENTS)) {
    events.onAsync(name, (env) => handleEvent(name, env));
  }
  for (const name of BROADCAST_ONLY) {
    events.onAsync(name, (env) => broadcast({ type: 'event', event: name, time: env.time, payload: env.payload }));
  }
  subscribed = true;
  logger.info(`[REALTIME] 实时推送已订阅 ${Object.keys(MESSAGE_EVENTS).length} 类消息事件 + ${BROADCAST_ONLY.length} 类广播事件`);
}

// 优雅停机：关闭所有 SSE 连接，避免阻塞 server.close
function closeAll() {
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.end(); } catch { /* ignore */ }
    }
  }
  clients.clear();
}

module.exports = { handleSSE, subscribe, closeAll, broadcast, CATEGORIES, _internal: { clients, MESSAGE_EVENTS } };