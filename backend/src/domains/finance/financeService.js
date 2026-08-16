'use strict';

// 财务域应用服务层（架构解耦 F2，2026-08-09）
//
// 职责：财务域自治——本文件是「非 finance 域写 FinanceRecord」的唯一门面。
// 依赖方向：controller / automation / quotation 引用本文件；本文件不反向依赖 controller。
// 来源：services/automationService.js 的 autoCreateReceivable 迁入（打破跨域直写，E6）。

const { Op } = require('sequelize');
const { Order, Customer, FinanceRecord } = require('../../models');

// 自动化生成应收的幂等标记（与历史一致：#auto）
const AUTO_MARKER = '#auto';

/**
 * 订单确认/进行中/已完成且有金额 → 自动生成应收财务记录（消除财务双录）
 * 幂等：已存在本自动化生成的应收则跳过；独立容错由调用方（automationService）负责。
 * @returns {Promise<number>} 本次新建应收条数
 */
async function autoCreateReceivable() {
  const orders = await Order.findAll({
    where: {
      status: { [Op.in]: ['confirmed', 'in_progress', 'completed'] },
      totalAmount: { [Op.gt]: 0 },
    },
  });
  let count = 0;
  for (const o of orders) {
    const exist = await FinanceRecord.findOne({
      where: { orderId: o.id, direction: 'receivable', description: { [Op.like]: `%${AUTO_MARKER}%` } },
    });
    if (exist) continue;
    const due = o.eta ? new Date(new Date(o.eta).getTime() + 30 * 24 * 3600 * 1000) : null;
    await FinanceRecord.create({
      orderId: o.id,
      counterpartyId: o.customerId,
      direction: 'receivable',
      category: 'ocean_freight',
      description: `订单${o.orderNo}确认自动生成应收 ${AUTO_MARKER}`,
      amount: o.totalAmount,
      currency: o.currency || 'USD',
      status: 'unpaid',
      dueDate: due ? due.toISOString().slice(0, 10) : null,
    });
    count += 1;
  }
  return count;
}

/**
 * 财务域唯一写入口门面（E6：跨域写数据收口）
 * 供报价转单等消费方在事务内创建财务记录，避免直连 FinanceRecord。
 * @param {Object} payload FinanceRecord 字段
 * @param {Object} [opts]  { transaction }
 */
async function createRecord(payload, opts = {}) {
  return FinanceRecord.create(payload, opts.transaction ? { transaction: opts.transaction } : undefined);
}

/**
 * —— 读门面（E6 对称收口：跨域读也统一经 finance 域，避免散落直查 FinanceRecord）——
 * 以下方法供「非 finance 域」读取财务数据；finance 域内部（controller/statement）仍可直接用模型。
 */

// 按订单读取费用记录（面向订单详情/打印/账期守卫等跨域读）
function findRecordsByOrderId(orderId, opts = {}) {
  return FinanceRecord.findAll({ where: { orderId }, ...opts });
}

// 按多订单批量读取（面向对账单/报表聚合）
function findRecordsByOrderIds(orderIds, opts = {}) {
  if (!Array.isArray(orderIds) || !orderIds.length) return Promise.resolve([]);
  return FinanceRecord.findAll({ where: { orderId: { [Op.in]: orderIds } }, ...opts });
}

// 超期应收（已过到期日且未收清）——面向预警/规则引擎
function findOverdueReceivable(now = new Date()) {
  return FinanceRecord.findAll({
    where: { direction: 'receivable', status: { [Op.in]: ['unpaid', 'partial'] }, dueDate: { [Op.lt]: now } },
    include: [{ model: Order, as: 'order', attributes: ['orderNo'] }],
  });
}

// 幂等/归属校验用的单条查询
function findRecord(where, opts = {}) {
  return FinanceRecord.findOne({ where, ...opts });
}

// 统计（面向演示数据/仪表盘数）
function countRecords(where = {}) {
  return FinanceRecord.count({ where });
}

// 按账期读取费用记录（面向结账/对账；periodRange 由调用方换算为起止 Date）
function findRecordsInPeriod(start, end) {
  return FinanceRecord.findAll({
    where: {
      [Op.and]: [
        {
          [Op.or]: [
            { settleMonth: { [Op.gte]: start, [Op.lt]: end } },
            { settleMonth: null, createdAt: { [Op.gte]: start, [Op.lt]: end } },
          ],
        },
      ],
    },
  });
}

// 按维度读取费用记录（面向多币种汇总/信用额度等聚合读；where 已含数据隔离约束）
function findRecordsForAggregation(where, opts = {}) {
  return FinanceRecord.findAll({ where, ...opts });
}

// ===== 聚合计算（纯函数，可单测；F2 收口：财务聚合逻辑自 financeController 下沉） =====

// 汇总应收/应付/已收/已付/利润（财务看板 summary 口径）
function summarizeRecords(rows) {
  let receivable = 0, payable = 0, received = 0, paid = 0;
  for (const r of rows) {
    const amt = Number(r.amount);
    const paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
  }
  return {
    receivable,             // 应收总额
    receivableBalance: receivable - received, // 未收
    received,
    payable,                // 应付总额
    payableBalance: payable - paid,           // 未付
    paid,
    profit: receivable - payable,             // 毛利
  };
}

// 财务汇总（where 由调用方按数据隔离构造）
async function getFinancialSummary(where) {
  const rows = await FinanceRecord.findAll({ where, attributes: ['direction', 'amount', 'paidAmount', 'status'] });
  return summarizeRecords(rows);
}

// 月度趋势（含利润和毛利率，按 createdAt 归月；where 需含年度 createdAt 范围）
function summarizeMonthlyTrend(rows) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, receivable: 0, payable: 0, profit: 0, marginRate: 0 }));
  for (const r of rows) {
    const m = new Date(r.createdAt).getMonth();
    // 使用本币折算金额优先（多币种准确），回退原币金额
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    if (r.direction === 'receivable') months[m].receivable += amt;
    else months[m].payable += amt;
  }
  for (const m of months) {
    m.profit = Number((m.receivable - m.payable).toFixed(2));
    m.marginRate = m.receivable ? Number(((m.profit / m.receivable) * 100).toFixed(2)) : 0;
  }
  return months;
}

async function getMonthlyTrend(year, where) {
  const rows = await FinanceRecord.findAll({ where, attributes: ['direction', 'amount', 'localAmount', 'createdAt'] });
  return summarizeMonthlyTrend(rows);
}

// 利润对比：本期 vs 上期（环比）或去年同月（同比）
function summarizeProfitCompare(rows, compareType = 'mom') {
  const current = { receivable: 0, payable: 0, profit: 0 };
  const previous = { receivable: 0, payable: 0, profit: 0 };
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = compareType === 'mom'
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const prevEnd = compareType === 'mom' ? currentStart : new Date(now.getFullYear(), now.getMonth() + 1, 1);

  for (const r of rows) {
    const d = new Date(r.createdAt);
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    if (r.direction === 'receivable') {
      if (d >= currentStart) current.receivable += amt;
      else if (d >= prevStart && d < prevEnd) previous.receivable += amt;
    } else {
      if (d >= currentStart) current.payable += amt;
      else if (d >= prevStart && d < prevEnd) previous.payable += amt;
    }
  }
  [current, previous].forEach((p) => {
    p.profit = Number((p.receivable - p.payable).toFixed(2));
    p.marginRate = p.receivable ? Number(((p.profit / p.receivable) * 100).toFixed(2)) : 0;
  });
  const diff = {
    profit: Number((current.profit - previous.profit).toFixed(2)),
    profitRate: previous.profit ? Number((((current.profit - previous.profit) / Math.abs(previous.profit)) * 100).toFixed(2)) : 0,
    marginRate: Number((current.marginRate - previous.marginRate).toFixed(2)),
    receivable: Number((current.receivable - previous.receivable).toFixed(2)),
    payable: Number((current.payable - previous.payable).toFixed(2)),
  };
  return { current, previous, diff, compareType, period: { currentLabel: compareType === 'mom' ? '本月' : '今年本月', previousLabel: compareType === 'mom' ? '上月' : '去年同月' } };
}

async function getProfitCompare(where, compareType = 'mom') {
  const rows = await FinanceRecord.findAll({ where, attributes: ['direction', 'amount', 'localAmount', 'createdAt'] });
  return summarizeProfitCompare(rows, compareType);
}

// 对账单汇总（按订单/客户归集应收/应付/余额；where 由调用方按数据隔离构造）
function summarizeReconcile(rows) {
  let receivable = 0, payable = 0, balance = 0;
  const items = rows.map((r) => {
    const amt = Number(r.amount);
    const paid = Number(r.paidAmount);
    const bal = amt - paid;
    if (r.direction === 'receivable') { receivable += amt; balance += bal; }
    else { payable += amt; balance -= bal; }
    return {
      id: r.id, direction: r.direction, category: r.category, description: r.description,
      currency: r.currency, amount: amt, paidAmount: paid, balance: bal, status: r.status,
      invoiceNo: r.invoiceNo, dueDate: r.dueDate, orderNo: r.order?.orderNo || '',
    };
  });
  return { receivable, payable, balance, itemCount: items.length, items };
}

async function buildReconcile(where) {
  const rows = await FinanceRecord.findAll({
    where,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    order: [['id', 'ASC']],
  });
  return summarizeReconcile(rows);
}

// AR 账龄：按客户聚合未收（应收-已收），账龄分桶 0-30/31-60/61-90/90+/已结清
// 口径：dueDate 优先（未设到期日按 createdAt）；未收原币 = amount - paidAmount；本币未收 = localAmount * (1 - paidAmount/amount)
function bucketAgAging(rows) {
  const now = new Date();
  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [], settled: [] };
  const byCustomer = new Map(); // customerId -> { customer, total, balance, buckets: {key: base} }
  const bucketKey = (days) => (days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');
  const keyOf = (cid) => String(cid || 0);

  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const paid = Number(r.paidAmount) || 0;
    const open = amt - paid; // 未收原币
    const localAmt = Number(r.localAmount);
    const openBase = localAmt ? Number((localAmt * (open / (amt || 1))).toFixed(2)) : open; // 本币未收
    const customer = r.order?.customer || null;
    const cid = customer?.id || 0;
    const cname = customer ? `${customer.name} (${customer.code})` : '未关联客户';
    if (open <= 0.001) {
      if (!byCustomer.has(cid)) byCustomer.set(cid, { id: cid, name: cname, total: 0, balance: 0, buckets: {} });
      continue;
    }
    const baseDate = r.dueDate ? new Date(r.dueDate) : new Date(r.createdAt);
    const days = Math.max(0, Math.floor((now - baseDate) / 86400000));
    const key = bucketKey(days);
    if (!byCustomer.has(cid)) byCustomer.set(cid, { id: cid, name: cname, total: 0, balance: 0, buckets: {} });
    const c = byCustomer.get(cid);
    c.balance += openBase;
    c.total += openBase;
    c.buckets[key] = (c.buckets[key] || 0) + openBase;
  }

  const customerList = [...byCustomer.values()].sort((a, b) => b.balance - a.balance);
  for (const c of customerList) {
    for (const key of Object.keys(buckets)) {
      if (c.buckets[key]) buckets[key].push({ customerId: c.id, name: c.name, balance: c.buckets[key] });
    }
  }
  for (const key of Object.keys(buckets)) buckets[key].sort((a, b) => b.balance - a.balance);

  const totalBalance = customerList.reduce((s, c) => s + c.balance, 0);
  const agedTotal = Object.keys(buckets).filter((k) => k !== 'settled').reduce((s, k) => s + buckets[k].reduce((x, i) => x + i.balance, 0), 0);
  return {
    generatedAt: now.toISOString(),
    totalBalance,       // 未收总余额（本币）
    agedTotal,          // 已逾期+未到期分桶合计
    buckets: {
      '0-30': { list: buckets['0-30'], total: buckets['0-30'].reduce((s, i) => s + i.balance, 0) },
      '31-60': { list: buckets['31-60'], total: buckets['31-60'].reduce((s, i) => s + i.balance, 0) },
      '61-90': { list: buckets['61-90'], total: buckets['61-90'].reduce((s, i) => s + i.balance, 0) },
      '90+': { list: buckets['90+'], total: buckets['90+'].reduce((s, i) => s + i.balance, 0) },
      settled: { count: rows.length - customerList.reduce((s, c) => s + c.buckets['0-30'] + c.buckets['31-60'] + c.buckets['61-90'] + c.buckets['90+'], 0), total: 0 },
    },
    customers: customerList.map((c) => ({ customerId: c.id, name: c.name, balance: c.balance, total: c.total, buckets: c.buckets })),
  };
}

async function getAgAging(where) {
  const rows = await FinanceRecord.findAll({
    where,
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'], include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }] },
    ],
  });
  return bucketAgAging(rows);
}

// 单票成本/毛利（B6）：按订单归集应收(FP)/应付(CP)，本币口径 localAmount 优先
function summarizeOrderMargin(rows) {
  let receivable = 0, payable = 0, received = 0, paid = 0;
  const byCategory = {};
  for (const r of rows) {
    // P3.7 本币口径：优先 localAmount（本币折算），缺省回退原币金额（历史数据兼容）
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    const paidAmt = r.localAmount != null ? Number((Number(r.paidAmount || 0) * (r.exchangeRate || 1)).toFixed(2)) : Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
    const key = r.category;
    byCategory[key] = byCategory[key] || { receivable: 0, payable: 0 };
    if (r.direction === 'receivable') byCategory[key].receivable += amt;
    else byCategory[key].payable += amt;
  }
  const margin = receivable - payable;
  const marginRate = receivable ? (margin / receivable) * 100 : 0;
  return {
    receivable, payable, received, paid,
    margin, marginRate: Number(marginRate.toFixed(2)),
    receivableBalance: receivable - received, payableBalance: payable - paid,
    byCategory, itemCount: rows.length,
  };
}

// 毛利汇总（按客户/业务员/航线分组；records 为所选订单的财务记录，orders 为可见订单）
function summarizeProfitGroups(orders, records, groupBy = 'customer') {
  const byOrder = {};
  for (const r of records) {
    const oid = r.orderId;
    byOrder[oid] = byOrder[oid] || { receivable: 0, payable: 0 };
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    if (r.direction === 'receivable') byOrder[oid].receivable += amt;
    else byOrder[oid].payable += amt;
  }
  const groups = {};
  for (const o of orders) {
    const g =
      groupBy === 'sales' ? (o.salesId ? `业务员#${o.salesId}` : '未分配') :
      groupBy === 'route' ? `${o.originPort || '?'}→${o.destPort || '?'}` :
      (o.customer?.name || '未知客户');
    groups[g] = groups[g] || { receivable: 0, payable: 0, orderCount: 0 };
    const fin = byOrder[o.id] || { receivable: 0, payable: 0 };
    groups[g].receivable += fin.receivable;
    groups[g].payable += fin.payable;
    groups[g].orderCount += 1;
  }
  return Object.entries(groups)
    .map(([name, v]) => ({ name, ...v, margin: v.receivable - v.payable, marginRate: v.receivable ? Number((((v.receivable - v.payable) / v.receivable) * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.margin - a.margin);
}

module.exports = {
  autoCreateReceivable,
  createRecord,
  AUTO_MARKER,
  // 读门面
  findRecordsByOrderId,
  findRecordsByOrderIds,
  findOverdueReceivable,
  findRecord,
  countRecords,
  findRecordsInPeriod,
  findRecordsForAggregation,
  // 聚合计算（pure + 查询封装）
  summarizeRecords,
  getFinancialSummary,
  summarizeMonthlyTrend,
  getMonthlyTrend,
  summarizeProfitCompare,
  getProfitCompare,
  summarizeReconcile,
  buildReconcile,
  bucketAgAging,
  getAgAging,
  summarizeOrderMargin,
  summarizeProfitGroups,
};