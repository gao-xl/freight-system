// B6 多币种换算 + 信用额度管控
const { ExchangeRate, Customer, Order } = require('../models');
const { findRecordsForAggregation } = require('../domains/finance/financeService');
const { getRate } = require('./externalService');

// 将指定金额换算为基准币种（默认 USD），无汇率时返回 null
async function convertTo(amount, currency, baseCurrency = 'USD') {
  if (!currency || currency === baseCurrency) return Number(amount) || 0;
  const rate = await getRate(baseCurrency, currency); // 目标币种 1 单位 = ? 基准
  if (rate == null) return null;
  return Number((Number(amount) / rate).toFixed(2));
}

// 财务汇总（按币种分组，再换算为基准币种）：应收/应付/已收/未收
// where：数据隔离范围约束（由调用方传入 scopedWhere 结果；不传则统计全部）
async function financeSummaryByCurrency(baseCurrency = 'USD', where = {}) {
  const rows = await findRecordsForAggregation(where, { attributes: ['direction', 'currency', 'amount', 'paidAmount'] });
  const byCurrency = new Map();
  for (const r of rows) {
    const key = r.currency || baseCurrency;
    const g = byCurrency.get(key) || { currency: key, receivable: 0, received: 0, payable: 0, paid: 0 };
    const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') { g.receivable += amt; g.received += paidAmt; }
    else { g.payable += amt; g.paid += paidAmt; }
    byCurrency.set(key, g);
  }
  // 换算基准币种合计
  const total = { receivable: 0, received: 0, payable: 0, paid: 0 };
  const list = [];
  for (const g of byCurrency.values()) {
    const conv = {
      ...g,
      receivableBase: await convertTo(g.receivable, g.currency, baseCurrency),
      receivedBase: await convertTo(g.received, g.currency, baseCurrency),
      payableBase: await convertTo(g.payable, g.currency, baseCurrency),
      paidBase: await convertTo(g.paid, g.currency, baseCurrency),
    };
    list.push(conv);
    if (conv.receivableBase != null) total.receivable += conv.receivableBase;
    if (conv.receivedBase != null) total.received += conv.receivedBase;
    if (conv.payableBase != null) total.payable += conv.payableBase;
    if (conv.paidBase != null) total.paid += conv.paidBase;
  }
  Object.keys(total).forEach((k) => { total[k] = Number(total[k].toFixed(2)); });
  return { baseCurrency, list, total };
}

// 客户应收未收余额（按币种）
async function customerReceivableBalance(customerId) {
  const rows = await findRecordsForAggregation(
    { direction: 'receivable' },
    { include: [{ model: Order, as: 'order', attributes: ['id', 'customerId'], where: { customerId } }] }
  );
  const byCurrency = new Map();
  for (const r of rows) {
    const key = r.currency || 'CNY';
    const bal = Number(r.amount) - Number(r.paidAmount);
    byCurrency.set(key, (byCurrency.get(key) || 0) + bal);
  }
  return [...byCurrency.entries()].map(([currency, balance]) => ({ currency, balance }));
}

// 信用额度校验：客户未收（换算基准币种）是否超过 creditLimit
// 返回 { ok, usedBase, limit, currency }
async function checkCustomerCredit(customerId, baseCurrency = 'CNY') {
  const customer = await Customer.findByPk(customerId);
  if (!customer) return { ok: true, usedBase: 0, limit: 0, currency: baseCurrency, message: '客户不存在，跳过额度校验' };
  const limit = Number(customer.creditLimit) || 0;
  if (limit <= 0) return { ok: true, usedBase: 0, limit, currency: baseCurrency, message: '未设置信用额度，不限制' };
  const balances = await customerReceivableBalance(customerId);
  let usedBase = 0;
  for (const b of balances) {
    const conv = await convertTo(b.balance, b.currency, baseCurrency);
    if (conv != null) usedBase += conv;
  }
  usedBase = Number(usedBase.toFixed(2));
  return { ok: usedBase <= limit, usedBase, limit, currency: baseCurrency, message: usedBase > limit ? `信用额度超限：已用 ${usedBase}，额度 ${limit}` : '' };
}

// P3 币种级对账：按币种统计应收/实收、应付/实付，并标记未核销（对账差异）
// 返回每币种的对账明细与整体对账状态
async function currencyReconcile(baseCurrency = 'USD', where = {}) {
  const rows = await findRecordsForAggregation(where, { attributes: ['direction', 'currency', 'amount', 'paidAmount'] });
  const byCurrency = new Map();
  for (const r of rows) {
    const key = (r.currency || baseCurrency).toUpperCase();
    const g = byCurrency.get(key) || {
      currency: key,
      receivable: 0, received: 0,
      payable: 0, paid: 0,
      receivableBalance: 0, payableBalance: 0,
    };
    const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') {
      g.receivable += amt;
      g.received += paidAmt;
      g.receivableBalance += (amt - paidAmt);
    } else {
      g.payable += amt;
      g.paid += paidAmt;
      g.payableBalance += (amt - paidAmt);
    }
    byCurrency.set(key, g);
  }
  const list = [...byCurrency.values()].map((g) => ({
    ...g,
    receivable: Number(g.receivable.toFixed(2)),
    received: Number(g.received.toFixed(2)),
    payable: Number(g.payable.toFixed(2)),
    paid: Number(g.paid.toFixed(2)),
    receivableBalance: Number(g.receivableBalance.toFixed(2)),
    payableBalance: Number(g.payableBalance.toFixed(2)),
    // 对账状态：余额接近 0 为已核销，否则未核销
    receivableStatus: Math.abs(g.receivableBalance) < 0.01 ? 'settled' : (g.receivableBalance > 0 ? 'unsettled' : 'overpaid'),
    payableStatus: Math.abs(g.payableBalance) < 0.01 ? 'settled' : (g.payableBalance > 0 ? 'unsettled' : 'overpaid'),
  }));
  const unsettled = list.filter((g) => g.receivableStatus !== 'settled' || g.payableStatus !== 'settled');
  return { baseCurrency, list, unsettledCount: unsettled.length, reconciled: unsettled.length === 0 };
}

module.exports = { convertTo, financeSummaryByCurrency, customerReceivableBalance, checkCustomerCredit, currencyReconcile };
