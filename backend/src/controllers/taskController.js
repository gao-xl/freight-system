const { Order, Booking, CustomsDeclaration, FinanceRecord, Customer, AlertRecord, QingdaoNode } = require('../models');
const { ok, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');

// 隔离单个数据源：任一查询失败仅跳过该来源，不影响整体待办聚合
async function safe(fn) {
  try { return await fn(); } catch (e) { return []; }
}

// A4 待办任务中心：按当前用户+角色聚合"今天该做的单"
// 基于预警/节点/财务/订舱/报关数据聚合，仅供读，不改变业务状态
const todo = asyncHandler(async (req, res) => {
  const role = req.user?.role || 'viewer';
  const now = new Date();
  const soon7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const items = [];

  // 通用：活跃预警（级别高优先）
  const alerts = await safe(async () => {
    return AlertRecord.findAll({
      where: { status: 'active' },
      order: [['level', 'DESC']],
      limit: 20,
      include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    });
  });
  for (const a of alerts) {
    items.push({
      type: 'alert', priority: a.level === 'danger' ? 'high' : 'medium',
      title: a.title, message: a.message, orderId: a.orderId, bizId: a.id,
      link: a.orderId ? `#/orders/${a.orderId}` : '#/alerts',
      dueAt: a.dueAt,
    });
  }

  // 待订舱订单（已确认但无订舱）
  const unbooked = await safe(async () => {
    const orderWithBooking = await Booking.findAll({ attributes: ['orderId'] });
    const bookedOrderIds = new Set(orderWithBooking.map((b) => b.orderId));
    return Order.findAll({
      where: { status: { [Op.in]: ['confirmed', 'in_progress'] }, id: { [Op.notIn]: [...bookedOrderIds] } },
      attributes: ['id', 'orderNo', 'etd', 'cargoDesc'],
      limit: 10,
    });
  });
  for (const o of unbooked) {
    items.push({ type: 'booking', priority: 'medium', title: '待订舱', message: `订单 ${o.orderNo} 尚未订舱`, orderId: o.id, bizId: o.id, link: `#/orders/${o.id}`, dueAt: o.etd });
  }

  // 待报关（已订舱但无报关）
  const unCustoms = await safe(async () => {
    const orderWithCustoms = await CustomsDeclaration.findAll({ attributes: ['orderId'] });
    const customsOrderIds = new Set(orderWithCustoms.map((c) => c.orderId));
    return Order.findAll({
      where: { status: { [Op.in]: ['confirmed', 'in_progress'] }, id: { [Op.notIn]: [...customsOrderIds] } },
      attributes: ['id', 'orderNo', 'etd'],
      limit: 10,
    });
  });
  for (const o of unCustoms) {
    items.push({ type: 'customs', priority: 'medium', title: '待报关', message: `订单 ${o.orderNo} 尚未报关`, orderId: o.id, bizId: o.id, link: `#/orders/${o.id}`, dueAt: o.etd });
  }

  // 超期应收（危险）
  const overdue = await safe(async () => {
    return FinanceRecord.findAll({
      where: { direction: 'receivable', status: { [Op.in]: ['unpaid', 'partial'] }, dueDate: { [Op.lt]: now } },
      attributes: ['id', 'orderId', 'amount', 'paidAmount', 'dueDate', 'description'],
      include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
      limit: 15,
    });
  });
  for (const f of overdue) {
    items.push({
      type: 'overdue_receivable', priority: 'high', title: '超期应收',
      message: `${f.order?.orderNo || '订单'} 应收 ${f.amount} 已逾期`, bizId: f.id,
      orderId: f.orderId, link: f.orderId ? `#/orders/${f.orderId}` : '#/finance', dueAt: f.dueDate,
    });
  }

  // 临期截港（若非财务只读）
  if (!['finance', 'viewer'].includes(role)) {
    const cutoff = await safe(async () => {
      return Order.findAll({
        where: { cutoffTime: { [Op.between]: [now, soon7] }, status: { [Op.in]: ['confirmed', 'in_progress'] } },
        attributes: ['id', 'orderNo', 'cutoffTime', 'containerNo'],
        limit: 10,
      });
    });
    for (const o of cutoff) {
      items.push({ type: 'cutoff', priority: 'medium', title: '临期截港', message: `订单 ${o.orderNo} 距截港不足 7 天`, orderId: o.id, bizId: o.id, link: `#/orders/${o.id}`, dueAt: o.cutoffTime });
    }
  }

  // 待跟进客户（销售/经理）——受 Customer.nextFollowAt 字段可用性保护
  if (['admin', 'manager', 'operator'].includes(role)) {
    const follow = await safe(async () => {
      const todays = new Date(now); todays.setHours(23, 59, 59, 999);
      return Customer.findAll({
        where: { nextFollowAt: { [Op.lte]: todays } },
        attributes: ['id', 'name', 'nextFollowAt', 'contact', 'phone'],
        limit: 10,
      });
    });
    for (const c of follow) {
      items.push({ type: 'customer_follow', priority: 'low', title: '待跟进客户', message: `${c.name} 计划跟进时间已到`, orderId: null, bizId: c.id, link: '#/customers', dueAt: c.nextFollowAt });
    }
  }

  // 青岛港卡点（危险）
  const blockedNodes = await safe(async () => {
    return QingdaoNode.findAll({
      where: { status: 'blocked' },
      attributes: ['id', 'orderId', 'node', 'detail'],
      include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
      limit: 10,
    });
  });
  for (const n of blockedNodes) {
    items.push({ type: 'qingdao_blocked', priority: 'high', title: '青岛港节点卡点', message: `订单 ${n.order?.orderNo || n.orderId} ${n.node} 卡点`, orderId: n.orderId, bizId: n.id, link: n.orderId ? `#/orders/${n.orderId}` : '#/qingdao' });
  }

  // 排序：high > medium > low，再按到期时间
  const prio = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => (prio[a.priority] - prio[b.priority]) || ((a.dueAt ? new Date(a.dueAt) : 0) - (b.dueAt ? new Date(b.dueAt) : 0)));

  const summary = items.reduce((acc, it) => { acc[it.priority] = (acc[it.priority] || 0) + 1; return acc; }, {});
  ok(res, { role, total: items.length, summary, items });
});

module.exports = { todo };