'use strict';

// P3-2 预算管理服务：编制 / 执行对比 / 差异分析 / 调整审批
// 数据隔离：Budget 携带 groupId，列表与单条按当前用户数据范围过滤（scopedWhere）；
//           执行实际值取指定小组年内 FinanceRecord 的聚合（localAmount 本币口径）。
const { Op, fn, col } = require('sequelize');
const { Budget, BudgetLine, BudgetAdjustment, FinanceRecord, Department, sequelize } = require('../models');
const { scopedWhere, scopedFindOne, attachOwnership } = require('../middleware/dataScope');
const { logger } = require('../utils/logger');

// 财务流水方向 → 预算方向
const DIRMAP = { revenue: 'receivable', cost: 'payable' };
// 预算行允许的费用类别（与 FinanceRecord.category 对齐）
const CATEGORIES = ['ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other'];
const CATEGORY_LABEL = {
  ocean_freight: '海运费', air_freight: '空运费', local_charge: '港口杂费', customs_fee: '报关费',
  document_fee: '单证费', warehouse_fee: '仓储费', transport_fee: '内陆运费', other: '其他',
};

// 预算期间起止（YYYY-MM-DD）
function periodBounds(periodType, period, year) {
  if (periodType === 'year') return { start: `${year}-01-01`, end: `${year}-12-31` };
  const qmap = { Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
  if (periodType === 'quarter') {
    const q = String(period || '').split('-')[1];
    const [s, e] = qmap[q] || [1, 12];
    return { start: `${year}-${String(s).padStart(2, '0')}-01`, end: `${year}-${String(e).padStart(2, '0')}-28` };
  }
  const m = parseInt(String(period || '').split('-')[1], 10) || 12;
  const last = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(m - 1) % 12];
  return { start: `${year}-${String(m).padStart(2, '0')}-01`, end: `${year}-${String(m).padStart(2, '0')}-${last}` };
}

// 校验 body 行是否合法；返回规整后的行数组
function sanitizeLines(lines) {
  if (!Array.isArray(lines)) return [];
  const out = [];
  for (const l of lines) {
    const category = CATEGORIES.includes(l.category) ? l.category : null;
    const direction = l.direction === 'cost' ? 'cost' : 'revenue';
    if (!category) continue;
    const amount = Math.max(0, Number(l.amount) || 0);
    out.push({ direction, category, amount, currency: l.currency || 'CNY' });
  }
  return out;
}

// ---------- 列表 ----------
async function list(req, { year, periodType, departmentId, status, keyword } = {}) {
  const base = {};
  if (year) base.year = Number(year);
  if (periodType) base.periodType = periodType;
  if (departmentId) base.departmentId = Number(departmentId);
  if (status) base.status = status;
  const where = await scopedWhere(req, base);
  const rows = await Budget.findAll({
    where,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
    order: [['year', 'DESC'], ['createdAt', 'DESC']],
  });
  return Promise.all(rows.map(async (b) => {
    const lines = await BudgetLine.findAll({ where: { budgetId: b.id }, attributes: ['direction', 'amount'] });
    const planned = lines.reduce((s, x) => s + Number(x.amount || 0), 0);
    return { ...b.toJSON(), department: b.department ? b.department.name : null, plannedTotal: planned, lineCount: lines.length };
  }));
}

// ---------- 执行实际值聚合 ----------
async function computeActuals(budget) {
  const { start, end } = periodBounds(budget.periodType, budget.period, budget.year);
  const lines = await BudgetLine.findAll({ where: { budgetId: budget.id } });
  const categories = [...new Set(lines.map((l) => l.category))];
  if (!categories.length) return { byKey: {}, detail: [], summary: { plannedTotal: 0, actualTotal: 0 } };
  const where = {
    status: { [Op.ne]: 'waived' },
    settleMonth: { [Op.between]: [start, end] },
    category: { [Op.in]: categories },
    direction: { [Op.in]: [...new Set(lines.map((l) => DIRMAP[l.direction]))] },
  };
  if (budget.groupId) where.groupId = budget.groupId;
  let actuals = [];
  try {
    actuals = await FinanceRecord.findAll({
      attributes: ['direction', 'category', [fn('SUM', col('localAmount')), 'actual']],
      where,
      group: ['direction', 'category'],
      raw: true,
    });
  } catch (e) {
    logger.warn('[BUDGET] 执行聚合失败，回退按 amount 口径', { message: e.message });
    actuals = await FinanceRecord.findAll({
      attributes: ['direction', 'category', [fn('SUM', col('amount')), 'actual']],
      where,
      group: ['direction', 'category'],
      raw: true,
    });
  }
  const byKey = {};
  for (const a of actuals) byKey[`${a.direction}:${a.category}`] = Number(a.actual) || 0;
  const detail = lines.map((l) => {
    const planned = Number(l.amount) || 0;
    const actual = byKey[`${DIRMAP[l.direction]}:${l.category}`] || 0;
    const execRate = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : (actual > 0 ? 999 : 0);
    return {
      id: l.id, direction: l.direction, category: l.category, categoryLabel: CATEGORY_LABEL[l.category] || l.category,
      planned, actual, execRate, variance: planned - actual, overBudget: actual > planned, note: l.note,
    };
  });
  const summary = {
    plannedTotal: detail.reduce((s, x) => s + x.planned, 0),
    actualTotal: detail.reduce((s, x) => s + x.actual, 0),
  };
  return { byKey, detail, summary };
}

// ---------- 单条详情（含执行分析） ----------
async function get(req, id) {
  const budget = await scopedFindOne(req, Budget, { id }, [
    { model: Department, as: 'department', attributes: ['id', 'name'] },
  ]);
  if (!budget) throw Object.assign(new Error('预算不存在'), { status: 404 });
  const [lines, adjustments, { detail, summary }] = await Promise.all([
    BudgetLine.findAll({ where: { budgetId: id } }),
    BudgetAdjustment.findAll({ where: { budgetId: id }, order: [['createdAt', 'DESC']] }),
    computeActuals(budget),
  ]);
  const plannedTotal = summary.plannedTotal;
  const actualTotal = summary.actualTotal;
  const overallRate = plannedTotal > 0 ? Math.round((actualTotal / plannedTotal) * 1000) / 10 : 0;
  return { ...budget.toJSON(), department: budget.department ? budget.department.name : null, lines: detail, adjustments, summary: { ...summary, overallRate } };
}

// ---------- 创建（含明细行） ----------
async function create(req, body) {
  const owned = await attachOwnership(req, { ...body });
  const { name, year, periodType = 'year', period, departmentId, direction = 'revenue', description, lines } = body;
  if (!name) throw Object.assign(new Error('请输入预算名称'), { status: 400 });
  if (!year || !period) throw Object.assign(new Error('请选择预算年度与期间'), { status: 400 });
  // 同名期间可重复编制（允许多版对比），不做唯一性硬约束
  const budget = await Budget.create({
    name, year: Number(year), periodType, period, departmentId: departmentId || null,
    direction, description, ownerId: owned.ownerId, creatorId: req.user.id, groupId: owned.groupId, status: 'draft',
  });
  const items = sanitizeLines(lines || []);
  if (items.length) {
    await BudgetLine.bulkCreate(items.map((l) => ({ ...l, budgetId: budget.id })));
  }
  return get(req, budget.id);
}

// ---------- 明细行维护 ----------
async function addLine(req, id, body) {
  await scopedFindOne(req, Budget, { id }); // 可见性校验
  const [line] = sanitizeLines([{ category: body.category, direction: body.direction, amount: body.amount, currency: body.currency }]);
  if (!line) throw Object.assign(new Error('非法的费用类别'), { status: 400 });
  const existing = await BudgetLine.findOne({ where: { budgetId: id, direction: line.direction, category: line.category } });
  if (existing) {
    return BudgetLine.update({ amount: line.amount, note: body.note || undefined, currency: line.currency }, { where: { id: existing.id } });
  }
  return BudgetLine.create({ ...line, budgetId: id, note: body.note });
}
async function updateLine(req, id, lineId, body) {
  await scopedFindOne(req, Budget, { id });
  const amount = Math.max(0, Number(body.amount) || 0);
  return BudgetLine.update({ amount, note: body.note }, { where: { id: lineId, budgetId: id } });
}
async function deleteLine(req, id, lineId) {
  await scopedFindOne(req, Budget, { id });
  await BudgetLine.destroy({ where: { id: lineId, budgetId: id } });
}

// ---------- 状态流转：提交生效 / 归档 ----------
async function transition(req, id, target) {
  const budget = await scopedFindOne(req, Budget, { id });
  if (!budget) throw Object.assign(new Error('预算不存在'), { status: 404 });
  if (target === 'approved' && budget.status === 'draft') {
    await budget.update({ status: 'approved' });
  } else if (target === 'closed' && budget.status !== 'closed') {
    await budget.update({ status: 'closed' });
  } else if (target === 'draft') {
    await budget.update({ status: 'draft' });
  } else {
    throw Object.assign(new Error(`非法的状态流转：${budget.status} → ${target}`), { status: 400 });
  }
  return get(req, id);
}

// ---------- 调整审批 ----------
async function createAdjustment(req, id, body) {
  const budget = await scopedFindOne(req, Budget, { id });
  if (!budget) throw Object.assign(new Error('预算不存在'), { status: 404 });
  if (budget.status !== 'approved') throw Object.assign(new Error('仅已生效预算可发起调整'), { status: 400 });
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  if (!category || !body.reason) throw Object.assign(new Error('缺少调整类别或原因'), { status: 400 });
  const amount = Number(body.amount) || 0;
  if (amount === 0) throw Object.assign(new Error('调整额不能为 0'), { status: 400 });
  return BudgetAdjustment.create({
    budgetId: id, direction: body.direction === 'cost' ? 'cost' : 'revenue', category,
    amount, reason: String(body.reason).slice(0, 255), requestedBy: req.user.id, requestedAt: new Date(), status: 'pending',
  });
}
async function reviewAdjustment(req, adjId, approve, rejectReason) {
  const adj = await BudgetAdjustment.findByPk(adjId);
  if (!adj) throw Object.assign(new Error('调整单不存在'), { status: 404 });
  await scopedFindOne(req, Budget, { id: adj.budgetId }); // 权限校验
  if (adj.status !== 'pending') throw Object.assign(new Error('该调整单已处理'), { status: 400 });
  if (!approve) {
    await adj.update({ status: 'rejected', approvedBy: req.user.id, approvedAt: new Date(), rejectReason: String(rejectReason || '').slice(0, 255) });
    return adj;
  }
  // 批准：调整对应行金额，并递增预算版本
  const trans = await sequelize.transaction();
  try {
    const line = await BudgetLine.findOne({ where: { budgetId: adj.budgetId, direction: adj.direction, category: adj.category } });
    if (line) {
      const next = Math.max(0, Number(line.amount) + Number(adj.amount));
      await line.update({ amount: next }, { transaction: trans });
    } else {
      await BudgetLine.create({ budgetId: adj.budgetId, direction: adj.direction, category: adj.category, amount: Math.max(0, Number(adj.amount)) }, { transaction: trans });
    }
    await adj.update({ status: 'approved', approvedBy: req.user.id, approvedAt: new Date() }, { transaction: trans });
    await Budget.increment('version', { by: 1, where: { id: adj.budgetId }, transaction: trans });
    await trans.commit();
  } catch (e) {
    await trans.rollback();
    throw e;
  }
  return adj.reload();
}

module.exports = { list, get, create, addLine, updateLine, deleteLine, transition, createAdjustment, reviewAdjustment, computeActuals, CATEGORIES, CATEGORY_LABEL, DIRMAP };