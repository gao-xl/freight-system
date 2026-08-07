const { Op } = require('sequelize');
const { sequelize, Quotation, QuotationItem, Order, FinanceRecord } = require('../models');
const { genCode } = require('../utils/response');
const events = require('./eventBus');

// 计算报价单汇总金额
function calcTotals(items) {
  let totalAmount = 0;
  let costAmount = 0;
  const rows = (items || []).map((it, idx) => {
    const quantity = Number(it.quantity) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    const amount = Number((quantity * unitPrice).toFixed(2));
    const row = {
      ...it,
      amount,
      sortOrder: it.sortOrder ?? idx,
    };
    if (row.direction === 'revenue') totalAmount += amount;
    else if (row.direction === 'cost') costAmount += amount;
    return row;
  });
  totalAmount = Number(totalAmount.toFixed(2));
  costAmount = Number(costAmount.toFixed(2));
  const profitAmount = Number((totalAmount - costAmount).toFixed(2));
  const profitRate = totalAmount > 0 ? Number(((profitAmount / totalAmount) * 100).toFixed(2)) : 0;
  return { rows, totalAmount, costAmount, profitAmount, profitRate };
}

// 新建报价单（头 + 明细，事务）
async function createQuotation(body) {
  const { items, ...header } = body;
  const calc = calcTotals(items);
  return sequelize.transaction(async (t) => {
    const quoteNo = genCode('QT');
    const quotation = await Quotation.create(
      {
        ...header,
        quoteNo,
        totalAmount: calc.totalAmount,
        costAmount: calc.costAmount,
        profitAmount: calc.profitAmount,
        profitRate: calc.profitRate,
      },
      { transaction: t }
    );
    if (calc.rows.length) {
      await QuotationItem.bulkCreate(
        calc.rows.map((r) => ({ ...r, quotationId: quotation.id })),
        { transaction: t }
      );
    }
    return Quotation.findByPk(quotation.id, {
      include: [{ model: QuotationItem, as: 'items' }],
      transaction: t,
    });
  });
}

// 更新报价单（头 + 明细整体重写，事务）；仅草稿可编辑
async function updateQuotation(id, body) {
  const { items, ...header } = body;
  const quotation = await Quotation.findByPk(id);
  if (!quotation) throw { status: 404, message: '报价单不存在' };
  if (quotation.status !== 'draft') throw { status: 400, message: '仅草稿状态的报价单可编辑' };
  const calc = calcTotals(items);
  return sequelize.transaction(async (t) => {
    await quotation.update(
      {
        ...header,
        totalAmount: calc.totalAmount,
        costAmount: calc.costAmount,
        profitAmount: calc.profitAmount,
        profitRate: calc.profitRate,
      },
      { transaction: t }
    );
    await QuotationItem.destroy({ where: { quotationId: id }, transaction: t });
    if (calc.rows.length) {
      await QuotationItem.bulkCreate(
        calc.rows.map((r) => ({ ...r, quotationId: id })),
        { transaction: t }
      );
    }
    return Quotation.findByPk(id, {
      include: [{ model: QuotationItem, as: 'items' }],
      transaction: t,
    });
  });
}

// 状态流转
async function transition(id, target, allowed, stepper) {
  const quotation = await Quotation.findByPk(id);
  if (!quotation) throw { status: 404, message: '报价单不存在' };
  if (!allowed.includes(quotation.status)) {
    throw { status: 400, message: `当前状态(${quotation.status})不允许该操作` };
  }
  const next = stepper(quotation);
  await quotation.update({ status: next });
  return quotation;
}

// 转化为订单：在事务内创建 Order，并将收入/成本明细落到财务应收应付
async function convertOrder(id, extra = {}) {
  const quotation = await Quotation.findByPk(id, {
    include: [
      { model: QuotationItem, as: 'items' },
      { model: require('../models').Customer, as: 'customer' },
    ],
  });
  if (!quotation) throw { status: 404, message: '报价单不存在' };
  if (quotation.status === 'converted') throw { status: 400, message: '该报价单已转化订单' };
  if (quotation.status !== 'confirmed') {
    throw { status: 400, message: '仅客户已确认的报价单可转化为订单' };
  }
  return sequelize.transaction(async (t) => {
    const order = await Order.create(
      {
        orderNo: genCode('SO'),
        customerId: quotation.customerId,
        type: quotation.type,
        mode: quotation.mode,
        serviceType: quotation.serviceType,
        originPort: quotation.originPort,
        destPort: quotation.destPort,
        originPlace: quotation.originPlace,
        destPlace: quotation.destPlace,
        cargoDesc: quotation.cargoDesc,
        cargoWeight: quotation.cargoWeight,
        cargoVolume: quotation.cargoVolume,
        packageCount: quotation.packageCount,
        currency: quotation.currency,
        totalAmount: quotation.totalAmount,
        quotationId: quotation.id,
        salesId: quotation.salesId,
        status: 'draft',
        remark: extra.remark || `由报价单 ${quotation.quoteNo} 转化`,
      },
      { transaction: t }
    );
    // 落财务应收应付
    for (const it of quotation.items) {
      await FinanceRecord.create(
        {
          orderId: order.id,
          direction: it.direction === 'revenue' ? 'receivable' : 'payable',
          category: it.category,
          description: it.name,
          amount: it.amount,
          currency: it.currency || quotation.currency,
          status: 'unpaid',
          counterpartyId: it.supplierId || null,
        },
        { transaction: t }
      );
    }
    await quotation.update({ status: 'converted' }, { transaction: t });
    events.emit('quotation.converted', { quotationId: quotation.id, orderId: order.id, customerId: quotation.customerId });
    return { order, quotation };
  });
}

// 报价统计
async function stats() {
  const [total, totalAmount, costAmount, converted] = await Promise.all([
    Quotation.count(),
    Quotation.sum('totalAmount', { where: { status: { [Op.ne]: 'cancelled' } } }) || 0,
    Quotation.sum('costAmount', { where: { status: { [Op.ne]: 'cancelled' } } }) || 0,
    Quotation.count({ where: { status: 'converted' } }),
  ]);
  const conversionRate = total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0;
  return { total, totalAmount, costAmount, converted, conversionRate };
}

module.exports = { calcTotals, createQuotation, updateQuotation, transition, convertOrder, stats };