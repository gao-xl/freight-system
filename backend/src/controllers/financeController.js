const { FinanceRecord, Order, Customer, Supplier, Invoice } = require('../models');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');
const { exportBuffer } = require('../services/exportService');
const { sequelize } = require('../models');
const { financeSummaryByCurrency, checkCustomerCredit } = require('../services/currencyService');

const base = crudController({
  name: 'finance',
  model: FinanceRecord,
  searchFields: ['description', 'invoiceNo'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  order: [['id', 'DESC']],
  scoped: true,
});

// 财务汇总：应收/应付/已收/已付/利润
const summary = asyncHandler(async (req, res) => {
  const finalWhere = await scopedWhere(req, {});
  const rows = await FinanceRecord.findAll({ where: finalWhere, attributes: ['direction', 'amount', 'paidAmount', 'status'] });
  let receivable = 0, payable = 0, received = 0, paid = 0;
  for (const r of rows) {
    const amt = Number(r.amount);
    const paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
  }
  ok(res, {
    receivable,        // 应收总额
    receivableBalance: receivable - received, // 未收
    received,
    payable,           // 应付总额
    payableBalance: payable - paid,           // 未付
    paid,
    profit: receivable - payable,             // 毛利
  });
});

// 月度应收应付趋势
const monthlyTrend = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year + 1}-01-01`);
  const baseWhere = { createdAt: { [Op.gte]: start, [Op.lt]: end } };
  const finalWhere = await scopedWhere(req, baseWhere);
  const rows = await FinanceRecord.findAll({
    where: finalWhere,
    attributes: ['direction', 'amount', 'createdAt'],
  });
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, receivable: 0, payable: 0 }));
  for (const r of rows) {
    const m = new Date(r.createdAt).getMonth();
    const amt = Number(r.amount);
    if (r.direction === 'receivable') months[m].receivable += amt;
    else months[m].payable += amt;
  }
  ok(res, months);
});

// Excel 导出财务流水
const exportExcel = asyncHandler(async (req, res) => {
  const finalWhere = await scopedWhere(req, {});
  const rows = await FinanceRecord.findAll({
    where: finalWhere,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    order: [['id', 'DESC']],
  });
  const data = rows.map((r) => ({
    orderNo: r.order?.orderNo || '',
    方向: r.direction === 'receivable' ? '应收' : '应付',
    费用类别: r.category,
    说明: r.description,
    币种: r.currency,
    金额: Number(r.amount),
    已收付: Number(r.paidAmount),
    状态: r.status,
    开票号: r.invoiceNo || '',
  }));
  const buf = await exportBuffer(
    data,
    [
      { header: '订单号', key: 'orderNo', width: 18 },
      { header: '方向', key: '方向', width: 8 },
      { header: '费用类别', key: '费用类别', width: 16 },
      { header: '说明', key: '说明', width: 30 },
      { header: '币种', key: '币种', width: 8 },
      { header: '金额', key: '金额', width: 14 },
      { header: '已收付', key: '已收付', width: 14 },
      { header: '状态', key: '状态', width: 10 },
      { header: '开票号', key: '开票号', width: 16 },
    ],
    '财务流水'
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="finance.xlsx"');
  res.send(Buffer.from(buf));
});

// 对账单生成（按订单或客户汇总应收/应付）
const reconcile = asyncHandler(async (req, res) => {
  const { orderId, customerId } = req.query;
  let where = {};
  if (orderId) where.orderId = orderId;
  if (customerId) where.counterpartyId = customerId;
  where = await scopedWhere(req, where);

  const rows = await FinanceRecord.findAll({
    where,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    order: [['id', 'ASC']],
  });

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

  ok(res, {
    orderId: orderId ? Number(orderId) : null,
    customerId: customerId ? Number(customerId) : null,
    receivable, payable, balance,
    itemCount: items.length,
    items,
  });
});

// 开票记录列表
const invoiceList = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 10, orderId, status, invoiceType } = req.query;
  let where = {};
  if (orderId) where.orderId = orderId;
  if (status) where.status = status;
  if (invoiceType) where.invoiceType = invoiceType;
  where = await scopedWhere(req, where);
  const { rows, count } = await Invoice.findAndCountAll({
    where,
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
    ],
    order: [['id', 'DESC']],
    limit: parseInt(pageSize), offset: (page - 1) * pageSize,
  });
  ok(res, { list: rows, total: count, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 创建开票记录（含税率计算）
const createInvoice = asyncHandler(async (req, res) => {
  const { invoiceType, orderId, customerId, supplierId, amount, currency, taxRate, remark } = req.body;
  if (!invoiceType) return ok(res, null, '请选择开票类型', 1, 400);
  const amt = Number(amount || 0);
  const tax = taxRate ? (amt * Number(taxRate)) / 100 : 0;
  const now = Date.now();
  const invoiceNo = `${invoiceType === 'receivable' ? 'AR' : 'AP'}-${now.toString().slice(-10)}`;
  // 有订单时自动填充收付对象
  let cid = customerId, sid = supplierId;
  if (orderId && !cid && !sid) {
    const order = await Order.findByPk(orderId);
    if (order) cid = order.customerId;
  }
  const me = await require('../models').User.findByPk(req.user.id);
  const inv = await Invoice.create({
    invoiceNo, invoiceType, orderId, customerId: cid, supplierId: sid,
    amount: amt, currency: currency || 'USD', taxRate: taxRate || 0, taxAmount: tax, totalAmount: amt + tax,
    status: 'draft', remark, createdBy: req.user?.id,
    groupId: me?.groupId || null, ownerId: req.user.id,
  });
  ok(res, inv, '开票记录已创建');
});

// 开票（草稿 → 已开）
const issueInvoice = asyncHandler(async (req, res) => {
  const inv = await scopedFindOne(req, Invoice, { id: req.params.id });
  if (!inv) return ok(res, null, '发票不存在', 1, 404);
  if (inv.status !== 'draft') return ok(res, null, '仅草稿状态可开票', 1, 400);
  await inv.update({ status: 'issued', issuedAt: new Date() });
  ok(res, inv, '已开票');
});

// 作废发票
const cancelInvoice = asyncHandler(async (req, res) => {
  const inv = await scopedFindOne(req, Invoice, { id: req.params.id });
  if (!inv) return ok(res, null, '发票不存在', 1, 404);
  if (inv.status === 'paid') return ok(res, null, '已核销发票不可作废', 1, 400);
  await inv.update({ status: 'cancelled' });
  ok(res, inv, '已作废');
});

// 收款/付款核销（累加 paidAmount 并更新状态）
const writeoff = asyncHandler(async (req, res) => {
  const { amount, remark } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return ok(res, null, '核销金额必须大于 0', 1, 400);

  const rec = await scopedFindOne(req, FinanceRecord, { id: req.params.id });
  if (!rec) return ok(res, null, '费用记录不存在', 1, 404);
  if (rec.status === 'paid' || rec.status === 'waived') return ok(res, null, '该记录已完成，无需核销', 1, 400);

  const total = Number(rec.amount);
  const paidPrev = Number(rec.paidAmount);
  const newPaid = Math.min(paidPrev + amt, total);
  const status = newPaid >= total ? 'paid' : 'partial';

  await rec.update({ paidAmount: newPaid, status, paidAt: status === 'paid' ? new Date() : rec.paidAt, remark: remark || rec.remark });
  ok(res, { ...rec.toJSON(), applied: newPaid - paidPrev, leftover: total - newPaid }, '核销成功');
});

// 批量核销（批量记为已收付）：POST /finance/batch-writeoff { ids: [] }
// 默认将所选记录一次性全额收/付完成；amount 存在时按统一金额部分核销
const batchWriteoff = asyncHandler(async (req, res) => {
  const { ids, amount } = req.body;
  const idList = (Array.isArray(ids) ? ids : String(ids || '').split(',')).map(Number).filter((n) => n > 0);
  if (!idList.length) return ok(res, null, '请先选择要核销的费用记录', 1, 400);
  const fixedAmt = amount ? Number(amount) : null;
  const fsWhere = await scopedWhere(req, { id: { [Op.in]: idList } });
  const recs = await FinanceRecord.findAll({ where: fsWhere });
  const done = [], skipped = [];
  for (const rec of recs) {
    if (rec.status === 'paid' || rec.status === 'waived') { skipped.push(rec.id); continue; }
    const total = Number(rec.amount);
    const paidPrev = Number(rec.paidAmount);
    const newPaid = fixedAmt ? Math.min(paidPrev + fixedAmt, total) : total;
    const status = newPaid >= total ? 'paid' : 'partial';
    await rec.update({ paidAmount: newPaid, status, paidAt: status === 'paid' ? new Date() : rec.paidAt });
    done.push(rec.id);
  }
  ok(res, { done: done.length, skipped: skipped.length }, `已核销 ${done.length} 条${skipped.length ? `，跳过已完成 ${skipped.length} 条` : ''}`);
});

// B6 多币种汇总：按币种分组并换算为基准币种
const currencySummary = asyncHandler(async (req, res) => {
  const base = (req.query.base || 'USD').toUpperCase();
  // B2 数据隔离：汇总仅统计当前用户可见范围的财务记录（admin=all 不受限）
  const where = await scopedWhere(req, {});
  const data = await financeSummaryByCurrency(base, where);
  ok(res, data);
});

// B6 客户信用额度校验
const creditCheck = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  // B2 数据隔离：仅允许查询当前用户可见范围内的客户（admin=all 不受限）
  const customer = await scopedFindOne(req, Customer, { id: customerId });
  if (!customer) return fail(res, '客户不存在', 1, 404);
  const base = (req.query.base || 'CNY').toUpperCase();
  const data = await checkCustomerCredit(customerId, base);
  ok(res, data);
});

module.exports = { ...base, summary, monthlyTrend, exportExcel, reconcile, invoiceList, createInvoice, issueInvoice, cancelInvoice, writeoff, batchWriteoff, currencySummary, creditCheck };