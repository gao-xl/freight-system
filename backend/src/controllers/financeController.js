const { FinanceRecord, Order, Customer, Supplier, Invoice, AccountingPeriod, PaymentRecord } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler, genCode } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');
const { exportBuffer } = require('../services/exportService');
const { sequelize } = require('../services/dataAccess');
const { financeSummaryByCurrency, checkCustomerCredit } = require('../services/currencyService');
const finance = require('../domains/finance/financeService');
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
  const me = await require('../services/dataAccess').User.findByPk(req.user.id);
  // D13：发票号唯一约束冲突时重试生成新号（最多 3 次）
  let inv = null;
  for (let attempt = 0; attempt < 3 && !inv; attempt++) {
    const invoiceNo = `${prefix}-${genCode('').slice(-8)}-${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      inv = await Invoice.create({
        invoiceNo, invoiceType, orderId, customerId: cid, supplierId: sid,
        amount: amt, currency: currency || 'USD', taxRate: taxRate || 0, taxAmount: tax, totalAmount: amt + tax,
        status: 'draft', remark, createdBy: req.user?.id,
        groupId: me?.groupId || null, ownerId: req.user.id,
      });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError' && attempt < 2) continue;
      throw e;
    }
  }
  ok(res, inv, '开票记录已创建');
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
  const created = [];
  const t = await sequelize.transaction();
  try {
    for (const [currency, list] of Object.entries(byCurrency)) {
      const amt = Number(list.reduce((s, f) => s + Number(f.amount), 0).toFixed(2));
      const tax = Number(taxRate) ? Number((amt * Number(taxRate) / 100).toFixed(2)) : 0;
      let inv = null;
      for (let attempt = 0; attempt < 3 && !inv; attempt++) {
        const invoiceNo = `${prefix}-${genCode('').slice(-8)}-${Math.floor(Math.random() * 9000) + 1000}`;
        try {
          inv = await Invoice.create({
            invoiceNo, invoiceType, orderId,
            customerId: invoiceType === 'receivable' ? order.customerId : null,
            supplierId: null,
            amount: amt, currency, taxRate: Number(taxRate) || 0, taxAmount: tax, totalAmount: Number((amt + tax).toFixed(2)),
            items: JSON.stringify(list.map((f) => ({ financeId: f.id, description: f.description, amount: Number(f.amount), currency: f.currency }))),
            status: 'draft', createdBy: req.user?.id,
            groupId: me?.groupId || null, ownerId: req.user.id,
          }, { transaction: t });
        } catch (e) {
          if (e.name === 'SequelizeUniqueConstraintError' && attempt < 2) continue;
          throw e;
        }
      }
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

module.exports = {
  ...base, summary, monthlyTrend, exportExcel, reconcile, invoiceList, createInvoice, issueInvoice, createInvoiceFromFees,
  cancelInvoice, writeoff, batchWriteoff, currencySummary, creditCheck, createPayment, paymentList,
  periods, ensurePeriods, closePeriod, lockPeriod, unlockPeriod, periodStatement, batchCreate, aging,
};