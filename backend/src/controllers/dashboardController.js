const { Order, Customer, Supplier, Booking, CustomsDeclaration, FinanceRecord, User, Quotation } = require('../services/dataAccess');
const { ok, asyncHandler } = require('../utils/response');
const { Op, fn, col } = require('sequelize');
const { scopedWhere } = require('../middleware/dataScope');
const { readThrough } = require('../services/readCache');
const config = require('../config');

// 看板统计数据（B2 数据隔离：所有业务统计均限制在当前用户可见范围，admin=all 不受限）
// 方案 A：高频读缓存。看板一次聚合 13 条查询，是后端主要 DB 读压力源；
// 用短 TTL（默认 30s）容忍短暂过期，缓存键含数据作用域签名，避免跨用户/跨组泄漏。
const dashboard = asyncHandler(async (req, res) => {
  const data = await readThrough(req, 'dashboard', 'overview', config.cache.dashboardTtl, async () => {
    const [orderTotal, orderInProgress, orderCompleted, customerTotal, supplierTotal,
      bookingWait, customsPending, receivableBalance, payableBalance, userTotal,
      quotationTotal, bookingTotal, customsTotal] = await Promise.all([
      Order.count({ where: await scopedWhere(req, {}) }),
      Order.count({ where: await scopedWhere(req, { status: { [Op.in]: ['confirmed', 'in_progress'] } }) }),
      Order.count({ where: await scopedWhere(req, { status: 'completed' }) }),
      Customer.count({ where: await scopedWhere(req, { status: 'active' }) }),
      Supplier.count({ where: await scopedWhere(req, { status: 'active' }) }),
      Booking.count({ where: await scopedWhere(req, { status: { [Op.in]: ['new', 'confirmed'] } }) }),
      CustomsDeclaration.count({ where: await scopedWhere(req, { status: { [Op.in]: ['prepared', 'submitted', 'inspecting'] } }) }),
      FinanceRecord.findAll({ where: await scopedWhere(req, { direction: 'receivable' }), attributes: ['amount', 'paidAmount'] }),
      FinanceRecord.findAll({ where: await scopedWhere(req, { direction: 'payable' }), attributes: ['amount', 'paidAmount'] }),
      User.count({ where: { status: 'active' } }),
      // Onboarding Checklist 进度派生：报价/订舱/报关总数（向后兼容，原有字段不变）
      Quotation.count({ where: await scopedWhere(req, {}) }),
      Booking.count({ where: await scopedWhere(req, {}) }),
      CustomsDeclaration.count({ where: await scopedWhere(req, {}) }),
    ]);
    const recv = receivableBalance.reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);
    const pay = payableBalance.reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);
    return {
      orderTotal, orderInProgress, orderCompleted,
      customerTotal, supplierTotal, userTotal,
      bookingWait, customsPending,
      receivableBalance: recv, payableBalance: pay,
      // Onboarding Checklist 数据源
      quotationTotal, bookingTotal, customsTotal,
    };
  });
  ok(res, data);
});

// 订单状态分布（可按 ?type=import|export 过滤）
const orderStatusDist = asyncHandler(async (req, res) => {
  const baseWhere = req.query.type ? { type: req.query.type } : {};
  const where = await scopedWhere(req, baseWhere);
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
  const baseWhere = req.query.type ? { type: req.query.type } : {};
  const where = await scopedWhere(req, baseWhere);
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
  const where = await scopedWhere(req, {});
  const rows = await Order.findAll({
    where,
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
    order: [['updatedAt', 'DESC']],
    limit,
  });
  ok(res, rows);
});

// B1 经营指标：回款率、毛利率、应收/应付、利润
// 方案 A：高频读缓存（短 TTL），缓存键含数据作用域签名。
const metrics = asyncHandler(async (req, res) => {
  const data = await readThrough(req, 'dashboard', 'metrics', config.cache.dashboardTtl, async () => {
    const where = await scopedWhere(req, {});
    const rows = await FinanceRecord.findAll({ where, attributes: ['direction', 'amount', 'paidAmount'] });
    let receivable = 0, received = 0, payable = 0, paid = 0;
    for (const r of rows) {
      const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
      if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
      else { payable += amt; paid += paidAmt; }
    }
    const profit = receivable - payable;
    return {
      receivable, received, receivableBalance: receivable - received,
      payable, paid, payableBalance: payable - paid,
      profit,
      collectionRate: receivable ? Number(((received / receivable) * 100).toFixed(2)) : 0, // 回款率
      marginRate: receivable ? Number(((profit / receivable) * 100).toFixed(2)) : 0,       // 毛利率
    };
  });
  ok(res, data);
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
  const where = await scopedWhere(req, { direction: 'receivable' });
  const rows = await FinanceRecord.findAll({
    where,
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
  // B2 数据隔离：订单先按可见范围过滤，财务仅统计这些订单（杜绝跨范围泄漏）
  const orderWhere = await scopedWhere(req, {});
  const orders = await Order.findAll({ where: orderWhere, attributes: ['id', 'salesId'] });
  const orderIds = orders.map((o) => o.id);
  const finances = await FinanceRecord.findAll({
    where: { orderId: { [Op.in]: orderIds } },
    attributes: ['orderId', 'direction', 'amount', 'paidAmount'],
  });
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

// F9 团队工作量视图：按成员聚合订单负载（销售/操作双维度）+ 待办密度
// 面向主管/经理：一屏看清「谁在忙、谁手上有多少单、谁有积压」
// 数据隔离：订单先按当前用户可见范围过滤，杜绝跨范围泄漏；admin=all 看全量
const teamWorkload = asyncHandler(async (req, res) => {
  const orderWhere = await scopedWhere(req, {});
  const orders = await Order.findAll({
    where: orderWhere,
    attributes: ['id', 'salesId', 'ownerId', 'status', 'createdAt'],
  });
  const now = Date.now();
  const monthAgo = new Date(now - 30 * 24 * 3600 * 1000);

  // 按用户聚合：销售负责（salesId）与操作负责（ownerId）都计入
  const agg = new Map();
  const touch = (uid) => {
    if (!uid) return;
    if (!agg.has(uid)) agg.set(uid, { total: 0, active: 0, completed: 0, cancelled: 0, newThisMonth: 0 });
    return agg.get(uid);
  };
  for (const o of orders) {
    const st = o.status;
    for (const uid of [o.salesId, o.ownerId]) {
      const a = touch(uid);
      if (!a) continue;
      a.total += 1;
      const isMonth = new Date(o.createdAt) >= monthAgo;
      if (isMonth) a.newThisMonth += 1;
      if (st === 'completed') a.completed += 1;
      else if (st === 'cancelled') a.cancelled += 1;
      else if (['confirmed', 'in_progress'].includes(st)) a.active += 1;
    }
  }

  const ids = [...agg.keys()];
  const users = ids.length
    ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'name', 'username', 'role', 'status'] })
    : [];
  const roles = ['admin', 'manager', 'operator', 'finance', 'viewer'];
  const roleRank = Object.fromEntries(roles.map((r, i) => [r, i]));
  const list = users
    .map((u) => {
      const a = agg.get(u.id);
      return {
        userId: u.id,
        name: u.name || u.username,
        role: u.role,
        status: u.status,
        orderTotal: a.total,
        orderActive: a.active,
        orderCompleted: a.completed,
        orderCancelled: a.cancelled,
        orderNewThisMonth: a.newThisMonth,
        // 负载率：活跃订单 / 总订单（排除已完成/取消），越高说明手头在办的越多
        loadRate: a.total ? Number(((a.active / a.total) * 100).toFixed(1)) : 0,
      };
    })
    .sort((x, y) => (roleRank[x.role] ?? 99) - (roleRank[y.role] ?? 99) || y.orderTotal - x.orderTotal);

  const totals = list.reduce((acc, m) => {
    acc.orderTotal += m.orderTotal;
    acc.orderActive += m.orderActive;
    acc.orderCompleted += m.orderCompleted;
    acc.orderNewThisMonth += m.orderNewThisMonth;
    return acc;
  }, { orderTotal: 0, orderActive: 0, orderCompleted: 0, orderNewThisMonth: 0 });

  ok(res, { list, totals });
});

module.exports = { dashboard, orderStatusDist, modeDist, recentOrders, metrics, aging, salesPerformance, teamWorkload };