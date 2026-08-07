const { Order, Customer, Supplier, Booking, CustomsDeclaration, FinanceRecord, User } = require('../models');
const { ok, asyncHandler } = require('../utils/response');
const { Op, fn, col } = require('sequelize');

// 看板统计数据
const dashboard = asyncHandler(async (req, res) => {
  const [orderTotal, orderInProgress, orderCompleted, customerTotal, supplierTotal,
    bookingWait, customsPending, receivableBalance, payableBalance, userTotal] = await Promise.all([
    Order.count(),
    Order.count({ where: { status: { [Op.in]: ['confirmed', 'in_progress'] } } }),
    Order.count({ where: { status: 'completed' } }),
    Customer.count({ where: { status: 'active' } }),
    Supplier.count({ where: { status: 'active' } }),
    Booking.count({ where: { status: { [Op.in]: ['new', 'confirmed'] } } }),
    CustomsDeclaration.count({ where: { status: { [Op.in]: ['prepared', 'submitted', 'inspecting'] } } }),
    FinanceRecord.findAll({ where: { direction: 'receivable' }, attributes: ['amount', 'paidAmount'] }),
    FinanceRecord.findAll({ where: { direction: 'payable' }, attributes: ['amount', 'paidAmount'] }),
    User.count({ where: { status: 'active' } }),
  ]);
  const recv = receivableBalance.reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);
  const pay = payableBalance.reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);
  ok(res, {
    orderTotal, orderInProgress, orderCompleted,
    customerTotal, supplierTotal, userTotal,
    bookingWait, customsPending,
    receivableBalance: recv, payableBalance: pay,
  });
});

// 订单状态分布（可按 ?type=import|export 过滤）
const orderStatusDist = asyncHandler(async (req, res) => {
  const where = req.query.type ? { type: req.query.type } : {};
  const rows = await Order.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    where,
    group: ['status'],
    raw: true,
  });
  ok(res, rows.map(r => ({ name: r.status, value: r.count })));
});

// 运输模式分布（可按 ?type=import|export 过滤）
const modeDist = asyncHandler(async (req, res) => {
  const where = req.query.type ? { type: req.query.type } : {};
  const rows = await Order.findAll({
    attributes: ['mode', [fn('COUNT', col('id')), 'count']],
    where,
    group: ['mode'],
    raw: true,
  });
  ok(res, rows.map(r => ({ name: r.mode, value: r.count })));
});

// 最近订单
const recentOrders = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 200);
  const rows = await Order.findAll({
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
    order: [['updatedAt', 'DESC']],
    limit,
  });
  ok(res, rows);
});

// B1 经营指标：回款率、毛利率、应收/应付、利润
const metrics = asyncHandler(async (req, res) => {
  const rows = await FinanceRecord.findAll({ attributes: ['direction', 'amount', 'paidAmount'] });
  let receivable = 0, received = 0, payable = 0, paid = 0;
  for (const r of rows) {
    const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
  }
  const profit = receivable - payable;
  ok(res, {
    receivable, received, receivableBalance: receivable - received,
    payable, paid, payableBalance: payable - paid,
    profit,
    collectionRate: receivable ? Number(((received / receivable) * 100).toFixed(2)) : 0, // 回款率
    marginRate: receivable ? Number(((profit / receivable) * 100).toFixed(2)) : 0,       // 毛利率
  });
});

// B1 应收账龄分级（按到期日 vs 今日）
const aging = asyncHandler(async (req, res) => {
  const now = new Date();
  const day = (n) => new Date(now.getTime() + n * 24 * 3600 * 1000);
  const unbilled = { amount: 0, count: 0 };          // 未到期
  const agingBands = [
    { key: 'd0_30', label: '0-30天', min: 0, max: 30, amount: 0, count: 0 },
    { key: 'd31_60', label: '31-60天', min: 31, max: 60, amount: 0, count: 0 },
    { key: 'd61', label: '61天以上', min: 61, max: Infinity, amount: 0, count: 0 },
  ];
  const settled = { amount: 0, count: 0 };           // 已结清
  const rows = await FinanceRecord.findAll({
    where: { direction: 'receivable' },
    attributes: ['amount', 'paidAmount', 'dueDate', 'status'],
  });
  for (const r of rows) {
    const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
    const bal = amt - paidAmt;
    if (r.status === 'paid' || bal <= 0) { settled.amount += amt; settled.count += 1; continue; }
    if (!r.dueDate) { unbilled.amount += bal; unbilled.count += 1; continue; }
    const days = Math.floor((now - new Date(r.dueDate)) / (24 * 3600 * 1000));
    if (days <= 0) { unbilled.amount += bal; unbilled.count += 1; }
    else {
      const band = agingBands.find((b) => days >= b.min && days <= b.max) || agingBands[2];
      band.amount += bal; band.count += 1;
    }
  }
  // 累计账龄金额（用于可视化）
  let cum = 0;
  const bands = agingBands.map((b) => { cum += b.amount; return { key: b.key, label: b.label, amount: b.amount, count: b.count, cumulative: cum }; });
  ok(res, { unbilled, bands, settled, totalUnpaid: unbilled.amount + bands.reduce((s, b) => s + b.amount, 0) });
});

// B1 业务员业绩排行（按订单毛利+订单数，salesId 关联用户）
const salesPerformance = asyncHandler(async (req, res) => {
  const orders = await Order.findAll({ attributes: ['id', 'salesId'] });
  const finances = await FinanceRecord.findAll({ attributes: ['orderId', 'direction', 'amount', 'paidAmount'] });
  const profitByOrder = {};
  for (const f of finances) {
    const oid = f.orderId;
    profitByOrder[oid] = profitByOrder[oid] || { receivable: 0, payable: 0 };
    const amt = Number(f.amount);
    if (f.direction === 'receivable') profitByOrder[oid].receivable += amt;
    else profitByOrder[oid].payable += amt;
  }
  const bySales = {};
  for (const o of orders) {
    const sid = o.salesId;
    if (!sid) continue;
    bySales[sid] = bySales[sid] || { margin: 0, orderCount: 0 };
    const p = profitByOrder[o.id] || { receivable: 0, payable: 0 };
    bySales[sid].margin += p.receivable - p.payable;
    bySales[sid].orderCount += 1;
  }
  const salesIds = Object.keys(bySales).map(Number);
  const users = await User.findAll({ where: { id: { [Op.in]: salesIds } }, attributes: ['id', 'name', 'username'] });
  const nameMap = Object.fromEntries(users.map((u) => [u.id, u.name || u.username]));
  const list = Object.entries(bySales)
    .map(([sid, v]) => ({ salesId: Number(sid), name: nameMap[Number(sid)] || `业务员#${sid}`, ...v, margin: Number(v.margin.toFixed(2)) }))
    .sort((a, b) => b.margin - a.margin);
  ok(res, { list });
});

module.exports = { dashboard, orderStatusDist, modeDist, recentOrders, metrics, aging, salesPerformance };