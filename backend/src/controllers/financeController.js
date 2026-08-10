const { FinanceRecord, Order, Customer, Supplier, Invoice, AccountingPeriod, PaymentRecord, CompanyProfile, CompanyAccount, InvoiceTitle } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler, genCode } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');
const { exportBuffer } = require('../services/exportService');
const { sequelize } = require('../services/dataAccess');
const { financeSummaryByCurrency, checkCustomerCredit } = require('../services/currencyService');
const currencySvc = require('../services/currencyService');
const finance = require('../domains/finance/financeService');
const {
  buildDigitalTaxExcel,
  validateInvoice,
  countRemarkChars,
  getTaxInfo,
  TAX_CODE_MAP,
  TRANSPORT_MODE_MAP,
} = require('../services/digitalTaxInvoiceService');
const {
  periodCodeFromDate,
  getOrCreatePeriod,
  buildPeriodDefaults,
  recordsOfPeriod,
  summarize,
  computePeriodSummary,
  assertRecordEditable,
  assertRecordsEditable,
  assertBodyEditable,
  assertOrderEditable,
} = require('../services/periodGuard');

// beforeWrite 钩子：锁账拦截（落入已锁账期则拒绝写操作）
async function beforeWrite(req, item, body) {
  // 新增：按目标结算月份校验
  if (!item) {
    await assertBodyEditable(body || {});
    return;
  }
  const list = Array.isArray(item) ? item : [item];
  for (const rec of list) {
    if (rec instanceof FinanceRecord) await assertRecordEditable(rec);
  }
  // 编辑时若将结算月份改到已锁账期，一并拦截
  if (!Array.isArray(item) && body && body.settleMonth) {
    await assertBodyEditable(body);
  }
}

const base = crudController({
  name: 'finance',
  model: FinanceRecord,
  searchFields: ['description', 'invoiceNo'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  order: [['id', 'DESC']],
  scoped: true,
  beforeWrite,
});

// 财务汇总：应收/应付/已收/已付/利润（聚合逻辑在 financeService.summarizeRecords）
const summary = asyncHandler(async (req, res) => {
  const finalWhere = await scopedWhere(req, {});
  const data = await finance.getFinancialSummary(finalWhere);
  ok(res, data);
});

// 月度应收应付趋势
const monthlyTrend = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year + 1}-01-01`);
  const baseWhere = { createdAt: { [Op.gte]: start, [Op.lt]: end } };
  const finalWhere = await scopedWhere(req, baseWhere);
  const data = await finance.getMonthlyTrend(year, finalWhere);
  ok(res, data);
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

// 对账单生成（按订单或客户汇总应收/应付；聚合逻辑在 financeService.summarizeReconcile）
const reconcile = asyncHandler(async (req, res) => {
  const { orderId, customerId } = req.query;
  let where = {};
  if (orderId) where.orderId = orderId;
  if (customerId) where.counterpartyId = customerId;
  where = await scopedWhere(req, where);

  const data = await finance.buildReconcile(where);

  ok(res, {
    orderId: orderId ? Number(orderId) : null,
    customerId: customerId ? Number(customerId) : null,
    ...data,
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
// B2 数据隔离：订单须在用户可见范围内；D13 发票号并发冲突自动重试
const createInvoice = asyncHandler(async (req, res) => {
  const { invoiceType, orderId, customerId, supplierId, amount, currency, taxRate, remark } = req.body;
  if (!invoiceType) return fail(res, '请选择开票类型', 1, 400);
  const amt = Number(amount || 0);
  const tax = taxRate ? (amt * Number(taxRate)) / 100 : 0;
  const prefix = invoiceType === 'receivable' ? 'AR' : 'AP';
  // 有订单时自动填充收付对象（不可见订单视为不存在）
  let cid = customerId, sid = supplierId;
  if (orderId && !cid && !sid) {
    const order = await scopedFindOne(req, Order, { id: orderId });
    if (!order) return fail(res, '订单不存在或无权访问', 1, 404);
    cid = order.customerId;
  }
  await assertOrderEditable(orderId);
  const DataAccess = require('../services/dataAccess');
  const me = await DataAccess.User.findByPk(req.user.id);
  const { nextNumber } = require('../services/numberingService');
  // P1 发票号段：配置号段则按顺序自动发号；未配置则回退旧随机号
  const t = await DataAccess.sequelize.transaction();
  try {
    let invoiceNo = await nextNumber({
      bizType: invoiceType === 'receivable' ? 'invoice_ar' : 'invoice_ap',
      groupId: me?.groupId || null,
      transaction: t,
    });
    if (!invoiceNo) invoiceNo = `${prefix}-${genCode('').slice(-8)}-${Math.floor(Math.random() * 9000) + 1000}`;
    const inv = await Invoice.create({
      invoiceNo, invoiceType, orderId, customerId: cid, supplierId: sid,
      amount: amt, currency: currency || 'USD', taxRate: taxRate || 0, taxAmount: tax, totalAmount: amt + tax,
      status: 'draft', remark, createdBy: req.user?.id,
      groupId: me?.groupId || null, ownerId: req.user.id,
    }, { transaction: t });
    await t.commit();
    ok(res, inv, '开票记录已创建');
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 开票（草稿 → 已开）
const issueInvoice = asyncHandler(async (req, res) => {
  const inv = await scopedFindOne(req, Invoice, { id: req.params.id });
  if (!inv) return fail(res, '发票不存在', 1, 404);
  await assertOrderEditable(inv.orderId);
  if (inv.status !== 'draft') return fail(res, '仅草稿状态可开票', 1, 400);
  await inv.update({ status: 'issued', issuedAt: new Date() });
  ok(res, inv, '已开票');
});

// 批量开票：POST /finance/invoices/batch-issue { ids: [] }
const batchIssueInvoice = asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : String(req.body?.ids || '').split(','))
    .map(Number).filter((n) => n > 0);
  if (!ids.length) return fail(res, '请选择要开具的发票', 1, 400);
  const succeeded = [];
  const failed = [];
  for (const id of ids) {
    const inv = await scopedFindOne(req, Invoice, { id });
    if (!inv) { failed.push({ id, reason: '发票不存在' }); continue; }
    try {
      await assertOrderEditable(inv.orderId);
      if (inv.status !== 'draft') { failed.push({ id, reason: `非草稿状态(${inv.status})` }); continue; }
      await inv.update({ status: 'issued', issuedAt: new Date() });
      succeeded.push(id);
    } catch (e) {
      failed.push({ id, reason: e.message || '开票失败' });
    }
  }
  ok(res, { succeeded, failed, total: succeeded.length + failed.length }, `批量开票完成：成功 ${succeeded.length} 张，失败 ${failed.length} 张`);
});

// N2 从费用勾选生成发票：POST /finance/invoices/from-fees { orderId, feeIds?, invoiceType, taxRate }
// 按币种分组生成多张发票（同币种一张）；开票明细行 items 记录；回写费用 invoiceNo（勾稽）
// feeIds 为空 = 该订单全部未开票费用
const createInvoiceFromFees = asyncHandler(async (req, res) => {
  const { orderId, feeIds = [], invoiceType = 'receivable', taxRate = 0 } = req.body || {};
  if (!orderId) return fail(res, '缺少订单号', 1, 400);
  await assertOrderEditable(orderId);
  const order = await scopedFindOne(req, Order, { id: orderId });
  if (!order) return fail(res, '订单不存在或无权访问', 1, 404);

  const whereFees = { orderId };
  if (Array.isArray(feeIds) && feeIds.length) whereFees.id = { [Op.in]: feeIds };
  const fees = await FinanceRecord.findAll({ where: whereFees });
  const wantDir = invoiceType === 'payable' ? 'payable' : 'receivable';
  const candidates = fees.filter((f) => f.direction === wantDir && !f.invoiceNo && Number(f.amount) > 0);
  if (!candidates.length) return fail(res, `该订单没有未开票的${invoiceType === 'payable' ? '应付' : '应收'}费用`, 1, 400);

  // 按币种分组（同币种一张票）
  const byCurrency = {};
  for (const f of candidates) {
    const cur = f.currency || 'USD';
    (byCurrency[cur] = byCurrency[cur] || []).push(f);
  }
  const me = await require('../services/dataAccess').User.findByPk(req.user.id);
  const prefix = invoiceType === 'receivable' ? 'AR' : 'AP';
  const { nextNumber } = require('../services/numberingService');
  const created = [];
  const t = await sequelize.transaction();
  try {
    for (const [currency, list] of Object.entries(byCurrency)) {
      const amt = Number(list.reduce((s, f) => s + Number(f.amount), 0).toFixed(2));
      const tax = Number(taxRate) ? Number((amt * Number(taxRate) / 100).toFixed(2)) : 0;
      // P1 发票号段：配置号段则顺序发号，未配置回退随机号
      let invoiceNo = await nextNumber({
        bizType: invoiceType === 'receivable' ? 'invoice_ar' : 'invoice_ap',
        groupId: me?.groupId || null,
        transaction: t,
      });
      if (!invoiceNo) invoiceNo = `${prefix}-${genCode('').slice(-8)}-${Math.floor(Math.random() * 9000) + 1000}`;
      const inv = await Invoice.create({
        invoiceNo, invoiceType, orderId,
        customerId: invoiceType === 'receivable' ? order.customerId : null,
        supplierId: null,
        amount: amt, currency, taxRate: Number(taxRate) || 0, taxAmount: tax, totalAmount: Number((amt + tax).toFixed(2)),
        items: JSON.stringify(list.map((f) => ({ financeId: f.id, description: f.description, amount: Number(f.amount), currency: f.currency }))),
        status: 'draft', createdBy: req.user?.id,
        groupId: me?.groupId || null, ownerId: req.user.id,
      }, { transaction: t });
      for (const f of list) await f.update({ invoiceNo: inv.invoiceNo }, { transaction: t });
      created.push(inv);
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
  ok(res, { count: created.length, invoices: created.map((i) => i.toJSON()) }, `已生成 ${created.length} 张发票`);
});

// 作废发票
const cancelInvoice = asyncHandler(async (req, res) => {
  const inv = await scopedFindOne(req, Invoice, { id: req.params.id });
  if (!inv) return fail(res, '发票不存在', 1, 404);
  await assertOrderEditable(inv.orderId);
  if (inv.status === 'paid') return fail(res, '已核销发票不可作废', 1, 400);
  await inv.update({ status: 'cancelled' });
  ok(res, inv, '已作废');
});

// 收款/付款核销（累加 paidAmount 并更新状态）
const writeoff = asyncHandler(async (req, res) => {
  const { amount, remark } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return fail(res, '核销金额必须大于 0', 1, 400);

  const rec = await scopedFindOne(req, FinanceRecord, { id: req.params.id });
  if (!rec) return fail(res, '费用记录不存在', 1, 404);
  await assertRecordEditable(rec);
  if (rec.status === 'paid' || rec.status === 'waived') return fail(res, '该记录已完成，无需核销', 1, 400);

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
  if (!idList.length) return fail(res, '请先选择要核销的费用记录', 1, 400);
  const fixedAmt = amount ? Number(amount) : null;
  const fsWhere = await scopedWhere(req, { id: { [Op.in]: idList } });
  const recs = await FinanceRecord.findAll({ where: fsWhere });
  await assertRecordsEditable(recs);
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

// N3 收款/付款单：一笔到账按顺序分摊核销多张费用，联动发票状态
// POST /finance/payments { customerId|supplierId, direction, amount, currency, paidAt, financeIds, remark }
const createPayment = asyncHandler(async (req, res) => {
  const { customerId, supplierId, direction = 'received', amount, currency, paidAt, financeIds = [], remark } = req.body || {};
  const amt = Number(amount || 0);
  if (amt <= 0) return fail(res, '到账金额必须大于 0', 1, 400);
  if (!Array.isArray(financeIds) || !financeIds.length) return fail(res, '请选择要核销的费用', 1, 400);
  if (direction === 'received' && !customerId) return fail(res, '收款需指定客户', 1, 400);
  if (direction === 'paid' && !supplierId) return fail(res, '付款需指定供应商', 1, 400);
  const idList = financeIds.map(Number).filter((n) => n > 0);
  const fees = await FinanceRecord.findAll({ where: { id: { [Op.in]: idList } } });
  await assertRecordsEditable(fees);
  if (!fees.length) return fail(res, '未找到费用记录', 1, 404);
  const wantDir = direction === 'received' ? 'receivable' : 'payable';
  const targets = fees.filter((f) => f.direction === wantDir && f.status !== 'paid' && f.status !== 'waived');
  if (!targets.length) return fail(res, '所选费用无需核销（已结清或方向不符）', 1, 400);

  const t = await sequelize.transaction();
  try {
    let remaining = amt;
    let appliedCount = 0, appliedAmount = 0;
    const updated = [];
    for (const f of targets) {
      if (remaining <= 0) break;
      const total = Number(f.amount);
      const paidPrev = Number(f.paidAmount);
      const open = total - paidPrev;
      if (open <= 0.001) continue;
      const pay = Math.min(open, remaining);
      const newPaid = Number((paidPrev + pay).toFixed(2));
      const status = newPaid >= total - 0.001 ? 'paid' : 'partial';
      await f.update({ paidAmount: newPaid, status, paidAt: status === 'paid' ? new Date() : f.paidAt }, { transaction: t });
      remaining = Number((remaining - pay).toFixed(2));
      appliedCount += 1;
      appliedAmount += pay;
      updated.push(f);
      // 发票联动：费用结清且挂发票号 → 检查发票是否全部核销
      if (status === 'paid' && f.invoiceNo) await syncInvoiceStatusByNo(f.invoiceNo, t);
    }
    const code = `${direction === 'received' ? 'REC' : 'PAY'}${Date.now()}`;
    const rec = await PaymentRecord.create({
      code, direction, customerId: customerId || null, supplierId: supplierId || null,
      amount: amt, currency: currency || 'CNY', paidAt: paidAt || new Date().toISOString().slice(0, 10),
      appliedCount, appliedAmount: Number(appliedAmount.toFixed(2)), remark,
      groupId: req.user?.groupId || null, ownerId: req.user?.id || null,
    }, { transaction: t });
    const events = require('../services/eventBus');
    for (const f of updated) events.emit('finance.updated', { id: f.id, data: f.toJSON(), user: req.user });
    await t.commit();
    ok(res, { payment: rec.toJSON(), appliedCount, appliedAmount: Number(appliedAmount.toFixed(2)), leftover: remaining },
      `核销 ${appliedCount} 条费用，金额 ${appliedAmount.toFixed(2)}${remaining > 0 ? `，余 ${remaining.toFixed(2)} 未核销` : ''}`);
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 发票联动：发票 items 关联费用全部结清 → 发票置 paid
async function syncInvoiceStatusByNo(invoiceNo, t) {
  const inv = await Invoice.findOne({ where: { invoiceNo }, transaction: t });
  if (!inv || inv.status !== 'issued') return;
  let items = [];
  try { items = JSON.parse(inv.items || '[]'); } catch { items = []; }
  if (!items.length) return;
  const feeIds = items.map((i) => i.financeId).filter(Boolean);
  const fees = await FinanceRecord.findAll({ where: { id: { [Op.in]: feeIds } }, transaction: t });
  if (fees.length && fees.every((f) => f.status === 'paid' || f.status === 'waived')) {
    await inv.update({ status: 'paid' }, { transaction: t });
  }
}

// 收款/付款单列表
const paymentList = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 10, direction, customerId } = req.query;
  const where = {};
  if (direction) where.direction = direction;
  if (customerId) where.customerId = customerId;
  const finalWhere = await scopedWhere(req, where);
  const { rows, count } = await PaymentRecord.findAndCountAll({
    where: finalWhere,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
    ],
    order: [['id', 'DESC']], limit: parseInt(pageSize), offset: (page - 1) * pageSize,
  });
  ok(res, { list: rows, total: count, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// B6 多币种汇总：按币种分组并换算为基准币种
const currencySummary = asyncHandler(async (req, res) => {  const base = (req.query.base || 'USD').toUpperCase();
  // B2 数据隔离：汇总仅统计当前用户可见范围的财务记录（admin=all 不受限）
  const where = await scopedWhere(req, {});
  const data = await financeSummaryByCurrency(base, where);
  ok(res, data);
});

// P3 币种级对账：按币种统计应收/实收、应付/实付，并标记未核销差异
const currencyReconcile = asyncHandler(async (req, res) => {
  const base = (req.query.base || 'USD').toUpperCase();
  const where = await scopedWhere(req, {});
  const data = await currencySvc.currencyReconcile(base, where);
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

// ===== 结账 / 扎帐 / 锁帐 =====

// 账期列表（按年过滤，最近月份在前）
const periods = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const rows = await AccountingPeriod.findAll({ where: { year }, order: [['month', 'DESC']] });
  ok(res, rows);
});

// 自动补齐缺失账期（幂等）：依据现有费用记录归属月份
const ensurePeriods = asyncHandler(async (req, res) => {
  const rows = await FinanceRecord.findAll({ attributes: ['settleMonth', 'createdAt'] });
  const codes = new Set();
  for (const r of rows) codes.add(periodCodeFromDate(r.settleMonth || r.createdAt));
  let created = 0;
  for (const code of codes) {
    const [, isNew] = await AccountingPeriod.findOrCreate({
      where: { periodCode: code },
      defaults: { periodCode: code, ...buildPeriodDefaults(code) },
    });
    if (isNew) created++;
  }
  ok(res, { created, total: codes.size }, `账期已补齐，新建 ${created} 个`);
});

// 结账 / 扎帐：计算汇总快照并置为 closed
const closePeriod = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const note = (req.body || {}).note || null;
  const period = await getOrCreatePeriod(code);
  if (period.status === 'locked') return fail(res, `账期 ${code} 已锁帐，请先解锁`, 1, 400);
  const summary = await computePeriodSummary(code);
  await period.update({ ...summary, status: 'closed', closedBy: req.user?.id || null, closedAt: new Date(), closeNote: note });
  ok(res, period, '结账（扎帐）完成');
});

// 锁帐：彻底封存
const lockPeriod = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const note = (req.body || {}).note || null;
  const period = await getOrCreatePeriod(code);
  if (period.status === 'locked') return fail(res, `账期 ${code} 已锁帐`, 1, 400);
  await period.update({ status: 'locked', lockedBy: req.user?.id || null, lockedAt: new Date(), lockNote: note });
  ok(res, period, '已锁帐');
});

// 反结账 / 解锁：回到未结账状态，原因必填
const unlockPeriod = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const reason = ((req.body || {}).reason || '').toString().trim();
  if (!reason) return fail(res, '解锁必须填写原因', 1, 400);
  const period = await getOrCreatePeriod(code);
  if (period.status !== 'locked') return fail(res, '仅已锁帐账期可解锁', 1, 400);
  await period.update({ status: 'open', unlockedBy: req.user?.id || null, unlockedAt: new Date(), unlockReason: reason });
  ok(res, period, '已解锁，账期回到未结账状态');
});

// 结账汇总 / 结账单
const periodStatement = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const period = await getOrCreatePeriod(code);
  const items = await recordsOfPeriod(code);
  const summary = summarize(items);
  ok(res, { period, summary, items: items.map((r) => r.toJSON()) });
});

// N1 批量创建费用：POST /finance/batch { orderId, items: [{direction,category,description,amount,currency,dueDate,settleMonth}] }
// 走锁账拦截 + 模型钩子汇率折算 + 事件总线（finance.created 逐条）
const batchCreate = asyncHandler(async (req, res) => {
  const { orderId, items } = req.body || {};
  if (!orderId) return fail(res, '缺少订单号', 1, 400);
  if (!Array.isArray(items) || !items.length) return fail(res, '缺少费用明细', 1, 400);
  const list = items.filter((i) => i && Number(i.amount) > 0);
  if (!list.length) return fail(res, '费用明细金额均为空', 1, 400);
  // 锁账拦截：订单级 + 逐项结算月份
  await assertOrderEditable(orderId);
  for (const it of list) {
    if (it.settleMonth) await assertBodyEditable({ settleMonth: it.settleMonth });
  }
  const rows = await FinanceRecord.bulkCreate(list.map((it) => ({
    orderId,
    direction: it.direction === 'payable' ? 'payable' : 'receivable',
    category: it.category || 'other',
    description: String(it.description || '').slice(0, 255),
    amount: Number(it.amount) || 0,
    currency: String(it.currency || 'USD').toUpperCase().slice(0, 10),
    dueDate: it.dueDate || null,
    settleMonth: it.settleMonth || null,
    remark: String(it.remark || '').slice(0, 500),
    groupId: req.user?.groupId || null,
    ownerId: req.user?.id || null,
  })), { validate: true, individualHooks: true }); // individualHooks 触发每条 beforeCreate 汇率折算
  const events = require('../services/eventBus');
  for (const r of rows) events.emit('finance.created', { id: r.id, data: r.toJSON(), user: req.user });
  ok(res, { count: rows.length }, `已创建 ${rows.length} 条费用`);
});

// N5 AR 账龄：按客户聚合未收（应收-已收），账龄分桶 0-30/31-60/61-90/90+/已结清
// 口径：dueDate 优先（未设到期日按 createdAt）；未收原币 = amount - paidAmount；本币未收 = localAmount * (1 - paidAmount/amount)
// 聚合逻辑在 financeService.bucketAgAging
const aging = asyncHandler(async (req, res) => {
  const finalWhere = await scopedWhere(req, { direction: 'receivable' });
  const data = await finance.getAgAging(finalWhere);
  ok(res, data);
});

// ===== P0.1 红字冲销 =====

// 红字冲销：创建一笔与原记录金额相等、方向相反的冲销记录，并将原记录标记为已冲销
// POST /finance/:id/reverse { reason? }
const reverse = asyncHandler(async (req, res) => {
  const rec = await scopedFindOne(req, FinanceRecord, { id: req.params.id });
  if (!rec) return fail(res, '费用记录不存在', 1, 404);
  await assertRecordEditable(rec);
  if (rec.status === 'paid' || rec.status === 'waived') return fail(res, '已完成记录不可冲销', 1, 400);
  if (rec.reverseRef) return fail(res, '该记录已是冲销记录，不可再次冲销', 1, 400);

  // 查找是否存在已冲销的记录（防止重复冲销）
  const existingReverse = await FinanceRecord.findOne({ where: { reverseRef: rec.id } });
  if (existingReverse) return fail(res, '该记录已被冲销，请勿重复操作', 1, 400);

  const reason = ((req.body || {}).reason || '').toString().trim() || '红字冲销';

  const t = await sequelize.transaction();
  try {
    // 1. 创建冲销记录（方向相反、金额相同、币种一致）
    const reverseDir = rec.direction === 'receivable' ? 'payable' : 'receivable';
    const reverseRecord = await FinanceRecord.create({
      orderId: rec.orderId,
      direction: reverseDir,
      category: rec.category,
      description: `[红冲] ${rec.description}（${reason}）`,
      amount: rec.amount,
      currency: rec.currency,
      exchangeRate: rec.exchangeRate,
      localAmount: rec.localAmount ? Number(-Math.abs(Number(rec.localAmount)).toFixed(2)) : null,
      status: 'paid',  // 冲销记录直接标记为已完成
      counterpartyId: rec.counterpartyId,
      dueDate: rec.dueDate,
      settleMonth: rec.settleMonth,
      remark: `冲销原记录 #${rec.id}，${reason}`,
      groupId: rec.groupId,
      ownerId: req.user?.id || rec.ownerId,
      // 冲销关联
      reverseRef: rec.id,
      reverseType: 'full',
      reversedAt: new Date(),
      reversedBy: req.user?.id || null,
      reversedReason: reason,
    }, { transaction: t });

    // 2. 将原记录标记为已冲销（保留原记录，不删除）
    await rec.update({
      status: 'paid',
      paidAmount: rec.amount,  // 全额冲销
      paidAt: new Date(),
      remark: (rec.remark || '') + ` [已冲销 ${new Date().toISOString().slice(0, 10)}]`,
    }, { transaction: t });

    await t.commit();
    const events = require('../services/eventBus');
    events.emit('finance.created', { id: reverseRecord.id, data: reverseRecord.toJSON(), user: req.user });
    events.emit('finance.updated', { id: rec.id, data: rec.toJSON(), user: req.user });
    ok(res, { original: rec.toJSON(), reversed: reverseRecord.toJSON() }, '红字冲销成功');
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 查询冲销记录：GET /finance/:id/reversals
const getReversals = asyncHandler(async (req, res) => {
  const rec = await scopedFindOne(req, FinanceRecord, { id: req.params.id });
  if (!rec) return fail(res, '费用记录不存在', 1, 404);
  // 查找该记录的所有冲销记录
  const reversals = await FinanceRecord.findAll({ where: { reverseRef: rec.id } });
  // 如果该记录本身就是冲销记录，查找原记录
  let original = null;
  if (rec.reverseRef) {
    original = await FinanceRecord.findByPk(rec.reverseRef, { attributes: ['id', 'orderId', 'direction', 'category', 'description', 'amount', 'currency', 'status'] });
  }
  ok(res, { reversals, original });
});

// ===== 数电票批量导入文件生成 =====

/**
 * 加载销方信息（CompanyProfile + 默认 CNY 银行账号 + 默认开票抬头）
 * @returns {Object} seller { name, taxNo, address, phone, bankName, bankAccount }
 */
async function loadSellerInfo() {
  const profile = await CompanyProfile.findByPk(1);
  const account = await CompanyAccount.findOne({
    where: { isDefault: true, currency: 'CNY' },
    order: [['id', 'ASC']],
  });
  const defaultTitle = await InvoiceTitle.findOne({
    where: { isDefault: true, status: 'active' },
    order: [['id', 'ASC']],
  });
  return {
    name: profile?.companyName || defaultTitle?.titleName || '',
    taxNo: profile?.taxNo || defaultTitle?.taxNo || '',
    address: profile?.address || defaultTitle?.address || '',
    phone: profile?.phone || defaultTitle?.phone || '',
    bankName: account?.bankName || defaultTitle?.bankName || '',
    bankAccount: account?.accountNo || defaultTitle?.accountNo || '',
  };
}

/**
 * 加载单张发票的数电票预览数据（购方/明细/运输信息）
 * @param {Object} req - 请求对象（用于数据隔离）
 * @param {number} invoiceId - 发票 ID
 * @returns {Object|null} 发票预览数据
 */
async function loadInvoiceForDigitalTax(req, invoiceId) {
  const inv = await scopedFindOne(req, Invoice, { id: invoiceId });
  if (!inv) return null;

  // 购方信息
  let customer = null;
  if (inv.customerId) customer = await Customer.findByPk(inv.customerId);

  // 订单信息（运输信息来源）
  let order = null;
  if (inv.orderId) order = await Order.findByPk(inv.orderId);

  // 明细行：从 Invoice.items(JSON) 解析 + 补全 FinanceRecord
  let rawItems = [];
  try { rawItems = JSON.parse(inv.items || '[]'); } catch { rawItems = []; }

  const feeIds = rawItems.map((i) => i.financeId).filter(Boolean);
  const fees = feeIds.length
    ? await FinanceRecord.findAll({ where: { id: { [Op.in]: feeIds } } })
    : [];
  const feeMap = {};
  for (const f of fees) feeMap[f.id] = f;

  // 构建 CNY 明细行
  let enrichedItems = rawItems.map((item) => {
    const fee = feeMap[item.financeId];
    // 数电票必须人民币：原币 CNY 直接取，非 CNY 取 localAmount（本币折算）
    const cnyAmount = inv.currency === 'CNY'
      ? Number(item.amount || 0)
      : (fee ? Number(fee.localAmount || 0) : Number(item.amount || 0));
    const category = fee?.category || 'other';
    const taxInfo = getTaxInfo(category);
    return {
      financeId: item.financeId || null,
      description: item.description || '',
      amount: Number(cnyAmount.toFixed(2)),
      currency: 'CNY',
      originalAmount: Number(item.amount || 0),
      originalCurrency: item.currency || inv.currency || 'CNY',
      category,
      spmc: taxInfo.name,
      spbm: taxInfo.code,
      spsl: 1,
      dw: '次',
      ggxh: '',
    };
  });

  // 无明细时用发票金额兜底（仅 CNY 发票）
  if (!enrichedItems.length && inv.currency === 'CNY') {
    const taxInfo = getTaxInfo('transport_fee');
    enrichedItems.push({
      financeId: null,
      description: '货物运输服务',
      amount: Number(inv.amount) || 0,
      currency: 'CNY',
      category: 'transport_fee',
      spmc: taxInfo.name,
      spbm: taxInfo.code,
      spsl: 1,
      dw: '次',
      ggxh: '',
    });
  }

  // 判断是否货物运输（有订单且运输方式为 sea/air/land/rail）
  const isFreight = !!order && ['sea', 'air', 'land', 'rail'].includes(order.mode);
  const transportMode = order ? TRANSPORT_MODE_MAP[order.mode] : null;

  // 车牌号：从 customFields JSON 读取
  let vehiclePlate = '';
  if (order?.customFields) {
    try {
      const cf = JSON.parse(order.customFields);
      vehiclePlate = cf.vehiclePlate || cf.车牌号 || '';
    } catch { /* customFields 非 JSON 忽略 */ }
  }

  // 购方银行信息（Customer 无银行字段，留空由用户在对话框填写）
  const buyer = {
    name: customer?.name || '',
    taxNo: customer?.taxNo || '',
    address: customer?.address || '',
    phone: customer?.phone || '',
    bankName: '',
    bankAccount: '',
  };

  // CNY 金额汇总
  const totalJe = enrichedItems.reduce((s, i) => s + Number(i.amount), 0);
  const taxRate = Number(inv.taxRate) || 0;
  const totalSe = Number((totalJe * taxRate / 100).toFixed(2));
  const totalJshj = Number((totalJe + totalSe).toFixed(2));

  return {
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    originalCurrency: inv.currency,
    taxRate,
    buyer,
    order: order ? {
      orderNo: order.orderNo,
      mode: order.mode,
      originPlace: order.originPlace || '',
      destPlace: order.destPlace || '',
      cargoDesc: order.cargoDesc || '',
      vehiclePlate,
    } : null,
    items: enrichedItems,
    isFreight,
    transport: isFreight ? {
      qyd: order.originPlace || '',
      ddd: order.destPlace || '',
      ysgjzl: transportMode || '',
      ysgjhp: vehiclePlate || '',
      yshwmc: order.cargoDesc || '',
    } : null,
    remark: '',
    amount: totalJe,
    taxAmount: totalSe,
    totalAmount: totalJshj,
    // 非人民币发票无法转换时标记
    currencyWarning: inv.currency !== 'CNY' && !enrichedItems.length
      ? `发票原币 ${inv.currency}，需关联费用记录才能折算人民币`
      : null,
  };
}

/**
 * 数电票预览：POST /finance/invoices/digital-tax-preview
 * 加载所选发票的销方/购方/明细/运输信息，供前端对话框预览和编辑
 */
const digitalTaxPreview = asyncHandler(async (req, res) => {
  const { invoiceIds } = req.body || {};
  if (!Array.isArray(invoiceIds) || !invoiceIds.length) {
    return fail(res, '请选择至少一张发票', 1, 400);
  }

  const seller = await loadSellerInfo();
  const invoices = [];
  for (const id of invoiceIds) {
    const data = await loadInvoiceForDigitalTax(req, Number(id));
    if (data) invoices.push(data);
  }

  if (!invoices.length) return fail(res, '未找到有效的发票记录', 1, 404);
  ok(res, { seller, invoices });
});

/**
 * 数电票导出：POST /finance/invoices/digital-tax-export
 * 接收前端编辑后的发票数据 + 全局选项，生成数电票批量导入 Excel
 */
const exportDigitalTax = asyncHandler(async (req, res) => {
  const { invoices: clientInvoices, options = {} } = req.body || {};
  if (!Array.isArray(clientInvoices) || !clientInvoices.length) {
    return fail(res, '请选择至少一张发票', 1, 400);
  }

  // 销方信息（服务端加载，不信任客户端传入）
  const seller = await loadSellerInfo();

  // 校验每张发票
  const allErrors = [];
  for (let i = 0; i < clientInvoices.length; i++) {
    const inv = clientInvoices[i];
    const errs = validateInvoice(inv);
    if (errs.length) allErrors.push(`发票 ${inv.invoiceNo || inv.id || i + 1}：${errs.join('；')}`);
  }
  if (allErrors.length) {
    return fail(res, `数据校验未通过：\n${allErrors.join('\n')}`, 1, 400);
  }

  // 生成 Excel
  const buf = await buildDigitalTaxExcel(clientInvoices, seller, options);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = encodeURIComponent(`数电票批量导入_${dateStr}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(Buffer.from(buf));
});

module.exports = {
  ...base, summary, monthlyTrend, exportExcel, reconcile, invoiceList, createInvoice, issueInvoice, batchIssueInvoice, createInvoiceFromFees,
  cancelInvoice, writeoff, batchWriteoff, currencySummary, currencyReconcile, creditCheck, createPayment, paymentList,
  periods, ensurePeriods, closePeriod, lockPeriod, unlockPeriod, periodStatement, batchCreate, aging,
  reverse, getReversals, digitalTaxPreview, exportDigitalTax,
};