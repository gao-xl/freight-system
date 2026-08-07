const { Op } = require('sequelize');
const { Order, Booking, CustomsDeclaration, FinanceRecord, QingdaoNode, AlertRecord, Customer } = require('../models');
const { logger } = require('../utils/logger');

// 规则引擎：扫描业务数据产出预警
// 规则：ETA临近 / 船期变更 / 报关临期 / 超期应收 / 截港时间 / 青岛港卡点

// 写入预警（幂等：按 dedupKey 去重，已存在则更新而非重复插入）
async function upsertAlert({ type, level, orderId, bookingId, financeId, title, message, dueAt, dedupKey }) {
  const existing = await AlertRecord.findOne({ where: { dedupKey } });
  if (existing) {
    await existing.update({ level, title, message, dueAt, status: 'active' });
    return existing;
  }
  return AlertRecord.create({ type, level, orderId, bookingId, financeId, title, message, dueAt, dedupKey, status: 'active' });
}

// 规则1：ETA 临近（7 天内到港，未完成）
async function ruleEtaSoon() {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const orders = await Order.findAll({
    where: { eta: { [Op.between]: [now, soon] }, status: { [Op.in]: ['confirmed', 'in_progress'] } },
  });
  for (const o of orders) {
    const days = Math.ceil((new Date(o.eta) - now) / (24 * 3600 * 1000));
    await upsertAlert({
      type: 'eta_soon',
      level: days <= 2 ? 'danger' : 'warning',
      orderId: o.id,
      title: 'ETA 临近',
      message: `订单 ${o.orderNo} 预计 ${days} 天后到港（${o.eta}），请关注清关与送达安排`,
      dueAt: o.eta,
      dedupKey: `eta_soon:${o.id}:${o.eta}`,
    });
  }
}

// 规则2：超期应收（已过到期日且未收清）
async function ruleOverdueReceivable() {
  const now = new Date();
  const records = await FinanceRecord.findAll({
    where: { direction: 'receivable', status: { [Op.in]: ['unpaid', 'partial'] }, dueDate: { [Op.lt]: now } },
    include: [{ model: Order, as: 'order', attributes: ['orderNo'] }],
  });
  for (const r of records) {
    const days = Math.floor((now - new Date(r.dueDate)) / (24 * 3600 * 1000));
    const remain = Number(r.amount) - Number(r.paidAmount || 0);
    await upsertAlert({
      type: 'overdue_receivable',
      level: days >= 30 ? 'danger' : 'warning',
      orderId: r.orderId,
      financeId: r.id,
      title: '超期应收',
      message: `${r.order?.orderNo || '订单'} 应收 ${r.currency} ${remain} 已逾期 ${days} 天（到期 ${r.dueDate}）`,
      dueAt: r.dueDate,
      dedupKey: `overdue_receivable:${r.id}`,
    });
  }
}

// 规则3：报关临期 / 放行卡点（青岛港：有报关单但未放行，且距截港不足 24h）
async function ruleCustomsDeadline() {
  const now = new Date();
  const customs = await CustomsDeclaration.findAll({
    where: { status: { [Op.notIn]: ['released', 'cancelled'] } },
    include: [{ model: Order, as: 'order', attributes: ['orderNo', 'cutoffTime', 'terminal'] }],
  });
  for (const c of customs) {
    const o = c.order;
    if (!o) continue;
    if (o.cutoffTime && new Date(o.cutoffTime) - now < 24 * 3600 * 1000) {
      await upsertAlert({
        type: 'customs_deadline',
        level: 'danger',
        orderId: o.id,
        title: '报关临近截港',
        message: `订单 ${o.orderNo} 报关未放行，距截港（${o.cutoffTime}）不足 24 小时，请尽快处理`,
        dueAt: o.cutoffTime,
        dedupKey: `customs_deadline:${c.id}`,
      });
    }
  }
}

// 规则4：截港时间临近（青岛港）
async function ruleCutoffTime() {
  const now = new Date();
  const orders = await Order.findAll({
    where: { cutoffTime: { [Op.gte]: now }, status: { [Op.in]: ['confirmed', 'in_progress'] } },
  });
  for (const o of orders) {
    const hours = (new Date(o.cutoffTime) - now) / 3600000;
    if (hours <= 24) {
      await upsertAlert({
        type: 'cutoff_time',
        level: hours <= 6 ? 'danger' : 'warning',
        orderId: o.id,
        title: '截港时间临近',
        message: `订单 ${o.orderNo} 距截港（${o.cutoffTime}）仅 ${hours.toFixed(1)} 小时，请确认重箱已进港`,
        dueAt: o.cutoffTime,
        dedupKey: `cutoff_time:${o.id}`,
      });
    }
  }
}

// 规则5：青岛港出口卡点（存在 blocked 节点）
async function ruleQingdaoBlocked() {
  const blockedNodes = await QingdaoNode.findAll({ where: { status: 'blocked' } });
  for (const n of blockedNodes) {
    const o = await Order.findByPk(n.orderId, { attributes: ['orderNo', 'terminal'] });
    if (!o) continue;
    await upsertAlert({
      type: 'blocked',
      level: 'danger',
      orderId: n.orderId,
      bookingId: n.bookingId,
      title: '青岛港出口卡点',
      message: `订单 ${o.orderNo} 节点异常（${n.node}）：${n.detail || '请检查'}`,
      dueAt: n.eventTime || new Date(),
      dedupKey: `qingdao_blocked:${n.id}`,
    });
  }
}

// 运行全部规则
async function runAllRules() {
  const t0 = Date.now();
  try {
    await Promise.all([
      ruleEtaSoon(),
      ruleOverdueReceivable(),
      ruleCustomsDeadline(),
      ruleCutoffTime(),
      ruleQingdaoBlocked(),
    ]);
    logger.info(`[ALERT] 规则扫描完成，耗时 ${Date.now() - t0}ms`);
  } catch (e) {
    logger.error('[ALERT] 规则扫描失败', { message: e.message });
  }
}

// 查询预警列表
async function getAlerts({ status = 'active', level, orderId, page = 1, pageSize = 50 } = {}) {
  const where = {};
  if (status !== 'all') where.status = status;
  if (level) where.level = level;
  if (orderId) where.orderId = orderId;
  const { rows, count } = await AlertRecord.findAndCountAll({
    where,
    order: [['dueAt', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { list: rows, total: count };
}

// 处理预警（标记已解决/忽略）
async function resolveAlert(id, action) {
  const rec = await AlertRecord.findByPk(id);
  if (!rec) return null;
  const status = action === 'resolve' ? 'resolved' : 'ignored';
  await rec.update({ status, resolvedAt: new Date() });
  return rec;
}

module.exports = { runAllRules, getAlerts, resolveAlert, upsertAlert };