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