// 账期守卫：结账/扎帐/锁帐的核心服务
// 负责账期归属解析、结账汇总计算、以及锁账写操作拦截
const { Op } = require('sequelize');
const { AccountingPeriod, FinanceRecord } = require('../models');
const { findRecordsByOrderId } = require('../domains/finance/financeService');

// 由日期得到账期号，如 2026-08
function periodCodeFromDate(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 账期号对应的起止时间范围
function periodRange(periodCode) {
  const [y, m] = periodCode.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

// 构建账期默认值（建账期时使用）
function buildPeriodDefaults(periodCode) {
  const [y, m] = periodCode.split('-').map(Number);
  return {
    year: y,
    month: m,
    startDate: `${periodCode}-01`,
    endDate: new Date(y, m, 0).toISOString().slice(0, 10),
  };
}

// 单条费用记录的账期归属号：优先 settleMonth，其次 createdAt
function resolvePeriodCode(record) {
  return periodCodeFromDate(record?.settleMonth || record?.createdAt || new Date());
}

// 取账期，不存在则自动创建 open 账期
async function getOrCreatePeriod(periodCode) {
  const [period] = await AccountingPeriod.findOrCreate({
    where: { periodCode },
    defaults: { periodCode, ...buildPeriodDefaults(periodCode) },
  });
  return period;
}

// 该账期下的所有费用记录（settleMonth 命中优先，为空则按 createdAt）
// extraWhere：可选的数据隔离约束（scopedWhere 输出），用于结账单只统计当前用户可见范围
async function recordsOfPeriod(periodCode, extraWhere = {}) {
  const { start, end } = periodRange(periodCode);
  const andClauses = [
    {
      [Op.or]: [
        { settleMonth: { [Op.gte]: start, [Op.lt]: end } },
        { settleMonth: null, createdAt: { [Op.gte]: start, [Op.lt]: end } },
      ],
    },
  ];
  if (extraWhere && Object.keys(extraWhere).length) {
    if (extraWhere[Op.and]) {
      const arr = Array.isArray(extraWhere[Op.and]) ? extraWhere[Op.and] : [extraWhere[Op.and]];
      andClauses.push(...arr);
    } else {
      andClauses.push(extraWhere); // ownerId 等标量条件
    }
  }
  return FinanceRecord.findAll({ where: { [Op.and]: andClauses } });
}

// 汇总应收/应付/已收/已付/余额/毛利
function summarize(rows) {
  let receivable = 0, payable = 0, received = 0, paid = 0;
  for (const r of rows) {
    const amt = Number(r.amount), paidAmt = Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
  }
  return {
    receivable,
    payable,
    received,
    paid,
    balance: receivable - received,
    profit: receivable - payable,
  };
}

// 计算某账期的汇总
async function computePeriodSummary(periodCode) {
  return summarize(await recordsOfPeriod(periodCode));
}

// 依据费用记录归属账期，校验是否已锁账；已锁则抛错
async function assertRecordEditable(record) {
  if (!record) return;
  const code = resolvePeriodCode(record);
  const period = await AccountingPeriod.findOne({ where: { periodCode: code } });
  if (period && period.status === 'locked') {
    const err = new Error(`账期 ${code} 已锁帐，请先解锁后再操作`);
    err.status = 400;
    throw err;
  }
}

// 批量校验多条费用记录
async function assertRecordsEditable(records) {
  for (const r of records || []) await assertRecordEditable(r);
}

// 依据将要写入的月份（新增/编辑结算月份）校验：用于 create 及改结算月份
async function assertBodyEditable(body) {
  const code = periodCodeFromDate(body?.settleMonth || new Date());
  const period = await AccountingPeriod.findOne({ where: { periodCode: code } });
  if (period && period.status === 'locked') {
    const err = new Error(`账期 ${code} 已锁帐，请先解锁后再操作`);
    err.status = 400;
    throw err;
  }
}

// 依据订单关联的费用记录校验（开票/支付等入口）
async function assertOrderEditable(orderId) {
  if (!orderId) return;
  const records = await findRecordsByOrderId(orderId);
  await assertRecordsEditable(records);
}

module.exports = {
  periodCodeFromDate,
  resolvePeriodCode,
  getOrCreatePeriod,
  buildPeriodDefaults,
  recordsOfPeriod,
  summarize,
  computePeriodSummary,
  assertRecordEditable,
  assertRecordsEditable,
  assertBodyEditable,
  assertOrderEditable,
};