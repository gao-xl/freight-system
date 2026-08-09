'use strict';

// financeService 读门面 架构回归测试（tailtest）
// 覆盖风险：E6 跨域读解耦 —— 非 finance 域必须经 financeService 读财务数据，
// 且每个读方法须正确构造数据隔离约束 / 幂等约束 / 账期-时间兜底，不得漏 where。
// hermetic：不连 DB，monkey-patch 模型方法断言「调用方用了正确的 where + include」。

const test = require('node:test');
const assert = require('node:assert/strict');

const { FinanceRecord, Order } = require('../src/models');
const finance = require('../src/domains/finance/financeService');

// 替换模型方法，捕获调用参数并返回可预测结果
function patchFindAll(fn) {
  FinanceRecord.findAll = fn;
}
function patchFindOne(fn) {
  FinanceRecord.findOne = fn;
}
function patchCount(fn) {
  FinanceRecord.count = fn;
}

test('autoCreateReceivable: 查询只选 确认/进行中/已完成 且有金额 的订单（Sequelize 过滤契约）', async () => {
  // Order.findAll 的 where 过滤由 Sequelize 执行；此处断言代码传递了正确的过滤条件，
  // 并 stub 返回 1 个合格订单验证创建逻辑。
  let orderFilter = null;
  Order.findAll = async (opts) => { orderFilter = opts.where; return [{ id: 5, orderNo: 'O5', status: 'completed', totalAmount: 500, customerId: 9, currency: 'USD', eta: null }]; };
  const created = [];
  FinanceRecord.findOne = async () => null;
  FinanceRecord.create = async (rec) => { created.push(rec); return rec; };

  const count = await finance.autoCreateReceivable();

  // 状态白名单 + 金额>0 过滤必须传给 Sequelize，防止对草稿/零金额订单建应收
  assert.deepEqual(orderFilter.status[require('sequelize').Op.in], ['confirmed', 'in_progress', 'completed']);
  assert.equal(orderFilter.totalAmount[require('sequelize').Op.gt], 0, '必须过滤 totalAmount > 0');
  assert.equal(count, 1, '应为 stub 返回的 1 个合格订单建应收');
  assert.equal(created.length, 1);
  assert.ok(created[0].description.includes('#auto'), '应收应含 #auto 幂等标记');
});

test('autoCreateReceivable: 已存在自动化应收的订单跳过（幂等）', async () => {
  Order.findAll = async () => [
    { id: 1, orderNo: 'O1', status: 'confirmed', totalAmount: 100, customerId: 9, currency: 'USD', eta: null },
    { id: 2, orderNo: 'O2', status: 'confirmed', totalAmount: 200, customerId: 9, currency: 'USD', eta: null },
  ];
  // O1 已有应收，O2 没有
  FinanceRecord.findOne = async (opts) => (opts.where.orderId === 1 ? { id: 99 } : null);
  let createCalls = 0;
  FinanceRecord.create = async () => { createCalls += 1; return {}; };

  const count = await finance.autoCreateReceivable();
  assert.equal(count, 1, '只应为 O2 创建 1 条');
  assert.equal(createCalls, 1);
});

test('findRecordsByOrderIds: 空数组直接返回 []，不触发 findAll', async () => {
  let called = false;
  FinanceRecord.findAll = async () => { called = true; return []; };
  const out = await finance.findRecordsByOrderIds([]);
  assert.deepEqual(out, []);
  assert.equal(called, false, '空订单数组不应查库');
});

test('findRecordsByOrderIds: 多订单聚合用 Op.in 约束', async () => {
  let captured = null;
  FinanceRecord.findAll = async (opts) => { captured = opts; return []; };
  await finance.findRecordsByOrderIds([1, 2, 3]);
  assert.ok(captured, '应调用 findAll');
  assert.deepEqual(captured.where.orderId, { [require('sequelize').Op.in]: [1, 2, 3] });
});

test('findRecordsByOrderId: 按单一订单过滤，不透传任意 where', async () => {
  let captured = null;
  FinanceRecord.findAll = async (opts) => { captured = opts; return []; };
  await finance.findRecordsByOrderId(42);
  assert.equal(captured.where.orderId, 42);
});

test('findOverdueReceivable: 仅查 应收 + 未收清 + 已过到期日，并 include 订单号', async () => {
  let captured = null;
  FinanceRecord.findAll = async (opts) => { captured = opts; return []; };
  const now = new Date('2026-08-09T00:00:00Z');
  await finance.findOverdueReceivable(now);

  assert.equal(captured.where.direction, 'receivable');
  assert.deepEqual(captured.where.status, { [require('sequelize').Op.in]: ['unpaid', 'partial'] });
  assert.ok(captured.where.dueDate, '应收必须有到期日过滤，不漏全表扫');
  assert.ok(captured.include?.some?.((i) => i.model === Order), '应 include 订单以取 orderNo');
});

test('findRecord: 透传 where，支持幂等/归属校验', async () => {
  let captured = null;
  FinanceRecord.findOne = async (opts) => { captured = opts; return { id: 1 }; };
  const out = await finance.findRecord({ orderId: 7, direction: 'receivable' });
  assert.equal(out.id, 1);
  assert.equal(captured.where.orderId, 7);
});

test('countRecords: 透传统计 where', async () => {
  let captured = null;
  FinanceRecord.count = async (opts = {}) => { captured = opts; return 5; };
  const n = await finance.countRecords({ isDemo: true });
  assert.equal(n, 5);
  assert.deepEqual(captured.where, { isDemo: true });
});

test('findRecordsInPeriod: 账期命中优先 settleMonth，为空回退 createdAt', async () => {
  let captured = null;
  FinanceRecord.findAll = async (opts) => { captured = opts.where[require('sequelize').Op.and][0]; return []; };
  const start = new Date('2026-08-01T00:00:00Z');
  const end = new Date('2026-09-01T00:00:00Z');
  await finance.findRecordsInPeriod(start, end);

  const or = captured[require('sequelize').Op.or];
  assert.ok(or, '应含 OR 分支（settleMonth 命中 + createdAt 兜底）');
  assert.equal(or[0].settleMonth[require('sequelize').Op.gte], start);
  assert.equal(or[0].settleMonth[require('sequelize').Op.lt], end);
  assert.equal(or[1].settleMonth, null, 'settleMonth 为空时按 createdAt 兜底');
  assert.equal(or[1].createdAt[require('sequelize').Op.gte], start);
});

test('findRecordsForAggregation: 透传聚合 where + 附加 opts', async () => {
  let captured = null;
  FinanceRecord.findAll = async (opts) => { captured = opts; return []; };
  const attrs = ['direction', 'currency', 'amount', 'paidAmount'];
  await finance.findRecordsForAggregation({ groupId: 5 }, { attributes: attrs });
  assert.deepEqual(captured.where, { groupId: 5 });
  assert.deepEqual(captured.attributes, attrs);
});

// ===== 聚合计算收口（F2）：控制器直连模型逻辑下沉后，纯函数可单测 =====

test('summarizeRecords: 应收应付按 direction 归集，利润=应收-应付', () => {
  const s = finance.summarizeRecords([
    { direction: 'receivable', amount: 100, paidAmount: 40 },
    { direction: 'receivable', amount: 50, paidAmount: 0 },
    { direction: 'payable', amount: 30, paidAmount: 10 },
  ]);
  assert.equal(s.receivable, 150);
  assert.equal(s.received, 40);
  assert.equal(s.receivableBalance, 110);
  assert.equal(s.payable, 30);
  assert.equal(s.paid, 10);
  assert.equal(s.payableBalance, 20);
  assert.equal(s.profit, 120);
});

test('summarizeMonthlyTrend: 按 createdAt 归月，产出 12 个月序列', () => {
  const rows = [
    { direction: 'receivable', amount: 100, createdAt: '2026-01-15T00:00:00Z' },
    { direction: 'payable', amount: 40, createdAt: '2026-01-20T00:00:00Z' },
    { direction: 'receivable', amount: 200, createdAt: '2026-12-05T00:00:00Z' },
  ];
  const months = finance.summarizeMonthlyTrend(rows);
  assert.equal(months.length, 12);
  assert.equal(months[0].receivable, 100);
  assert.equal(months[0].payable, 40);
  assert.equal(months[11].receivable, 200);
  assert.equal(months[1].receivable, 0, '无记录月份应为 0');
});

test('summarizeReconcile: 对账单逐行余额 + 应收/应付/总余额', () => {
  const r = finance.summarizeReconcile([
    { id: 1, direction: 'receivable', category: 'frt', description: 'a', currency: 'USD', amount: 100, paidAmount: 30, status: 'partial', invoiceNo: 'AR-1', dueDate: null, order: { orderNo: 'SO1' } },
    { id: 2, direction: 'payable', category: 'frt', description: 'b', currency: 'USD', amount: 60, paidAmount: 60, status: 'paid', invoiceNo: null, dueDate: null, order: { orderNo: 'SO1' } },
  ]);
  assert.equal(r.receivable, 100);
  assert.equal(r.payable, 60);
  assert.equal(r.balance, 70, '应收行余额+70，应付行已结清余额0，累计70');
  assert.equal(r.itemCount, 2);
  assert.equal(r.items[0].balance, 70);
  assert.equal(r.items[0].orderNo, 'SO1');
});

test('bucketAgAging: 未收按账龄分桶，本币未收 = localAmount * (open/amount)', () => {
  const now0 = new Date();
  const daysAgo = (d) => new Date(now0.getTime() - d * 86400000).toISOString();
  const out = finance.bucketAgAging([
    { direction: 'receivable', amount: 100, paidAmount: 20, localAmount: 700, dueDate: daysAgo(10), createdAt: daysAgo(40), order: { order: 1, customer: { id: 1, code: 'C1', name: '客户A' } } },
    { direction: 'receivable', amount: 100, paidAmount: 0, localAmount: 700, dueDate: daysAgo(70), createdAt: daysAgo(90), order: { order: 1, customer: { id: 1, code: 'C1', name: '客户A' } } },
    { direction: 'receivable', amount: 100, paidAmount: 100, localAmount: 700, dueDate: daysAgo(10), createdAt: daysAgo(40), order: { order: 1, customer: { id: 1, code: 'C1', name: '客户A' } } },
  ]);
  // 第1条：未收80，本币 700*(80/100)=560，10天 → 0-30
  assert.equal(out.buckets['0-30'].total, 560);
  // 第2条：未收100，本币700，70天 → 61-90
  assert.equal(out.buckets['61-90'].total, 700);
  // 第3条：结清，不入未收分桶
  assert.equal(out.totalBalance, 1260);
  assert.equal(out.customers[0].balance, 1260);
});

test('summarizeOrderMargin: 单票毛利，本币口径 localAmount 优先', () => {
  const m = finance.summarizeOrderMargin([
    { direction: 'receivable', amount: 100, paidAmount: 40, localAmount: 700, exchangeRate: 7, category: 'frt' },
    { direction: 'payable', amount: 30, paidAmount: 10, localAmount: 210, exchangeRate: 7, category: 'frt' },
  ]);
  assert.equal(m.receivable, 700);
  assert.equal(m.payable, 210);
  assert.equal(m.margin, 490);
  assert.equal(m.itemCount, 2);
  assert.equal(m.byCategory.frt.receivable, 700);
  assert.equal(m.byCategory.frt.payable, 210);
});

test('summarizeProfitGroups: 按客户分组毛利，marginRate = 毛利/应收', () => {
  const orders = [
    { id: 1, salesId: 3, originPort: 'SHA', destPort: 'LAX', customer: { name: '客户A' } },
    { id: 2, salesId: 3, originPort: 'SHA', destPort: 'LAX', customer: { name: '客户A' } },
  ];
  const records = [
    { orderId: 1, direction: 'receivable', amount: 100, localAmount: 100, exchangeRate: 1 },
    { orderId: 1, direction: 'payable', amount: 60, localAmount: 60, exchangeRate: 1 },
    { orderId: 2, direction: 'receivable', amount: 100, localAmount: 100, exchangeRate: 1 },
  ];
  const list = finance.summarizeProfitGroups(orders, records, 'customer');
  assert.equal(list.length, 1);
  assert.equal(list[0].orderCount, 2);
  assert.equal(list[0].margin, 140, '应收200-应付60');
  assert.equal(list[0].marginRate, 70);
});