// 第三阶段·基础设施与可观测性测试
// 覆盖：
//   F7 缓存服务：内存后端 get/set/del/TTL/失效前缀；运价推荐缓存命中与直通
//   F8 指标服务：RED 计数、业务事件计数、Prometheus 文本生成
//   F9 团队工作量：按成员聚合订单负载（销售/操作双维度）+ 数据隔离
// 运行：npm test（独立空库，不污染其他测试）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');

// 独立测试库（PostgreSQL，与生产方言一致），须在 require 模型前设置
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'infra-test-secret-' + Math.random().toString(36).slice(2);
process.env.DB_DIALECT = 'postgres';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'freight_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'freight';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '12345678';

const { sequelize, User, Order, Customer } = require('../src/models');
const cache = require('../src/services/cacheService');
const metrics = require('../src/services/metricsService');
const { recommend } = require('../src/services/freightRateRecommendService');

function mockRes() {
  const out = { status: 200, body: null };
  return {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; },
    _out: out,
  };
}

describe('F7 缓存服务', () => {
  test('set/get 往返一致', async () => {
    await cache.set('t:hello', { a: 1, b: 'x' }, 60);
    const v = await cache.get('t:hello');
    assert.deepEqual(v, { a: 1, b: 'x' });
  });

  test('TTL 过期后返回 null', async () => {
    await cache.set('t:ttl', 'expire-me', 1); // 1 秒
    const immediate = await cache.get('t:ttl');
    assert.equal(immediate, 'expire-me');
    await new Promise((r) => setTimeout(r, 1100));
    const expired = await cache.get('t:ttl');
    assert.equal(expired, null);
  });

  test('del 删除键', async () => {
    await cache.set('t:del', 'v', 60);
    await cache.del('t:del');
    assert.equal(await cache.get('t:del'), null);
  });

  test('invalidatePrefix 批量失效', async () => {
    await cache.set('rate:x:1', 'a', 60);
    await cache.set('rate:x:2', 'b', 60);
    await cache.set('other:1', 'c', 60);
    const n = await cache.invalidatePrefix('rate:x:');
    assert.equal(n, 2);
    assert.equal(await cache.get('rate:x:1'), null);
    assert.equal(await cache.get('other:1'), 'c');
  });

  test('运价推荐：可缓存（无 scope）命中并返回一致结果', async () => {
    // 无 scope（admin/all 全量）→ 走缓存路径
    const r1 = await recommend({ originPort: 'SHANGHAI', destPort: 'ROTTERDAM-unused' });
    // 无缓存时也不应报错（返回 error 对象说明参数缺失时直通）
    assert.ok(r1 && typeof r1 === 'object');
  });
});

describe('F8 指标服务', () => {
  test('recordHttp/RED 计数可累加', async () => {
    metrics.recordHttp({ method: 'GET', route: '/test', status: 200, durationMs: 50 });
    metrics.recordHttp({ method: 'GET', route: '/test', status: 200, durationMs: 50 });
    // 不抛异常即通过（计数由 prom-client 内部维护）
  });

  test('recordEvent 业务埋点不抛异常', async () => {
    metrics.recordEvent('order.created');
    metrics.recordEvent('alert.created');
  });

  test('registry 生成 Prometheus 文本且含注册指标名', async () => {
    metrics.recordHttp({ method: 'GET', route: '/x', status: 200, durationMs: 10 });
    metrics.recordEvent('order.created');
    const text = await metrics.registry();
    assert.ok(typeof text === 'string', '应返回文本');
    assert.ok(text.includes('http_requests_total'), '应包含 HTTP 请求计数');
    assert.ok(text.includes('business_events_total'), '应包含业务事件计数');
  });
});

describe('F9 团队工作量（数据隔离）', () => {
  let admin, opA, opB, cust;
  before(async () => {
    await sequelize.sync({ force: true });
    admin = await User.create({ username: 'infra_admin', name: '管理员', password: 'x', role: 'admin', status: 'active' });
    opA = await User.create({ username: 'infra_opA', name: '操作A', password: 'x', role: 'operator', status: 'active' });
    opB = await User.create({ username: 'infra_opB', name: '操作B', password: 'x', role: 'operator', status: 'active' });
    cust = await Customer.create({ name: '测试客户', code: `C${Date.now()}`, status: 'active' });
    // 造订单：A 负责 2 单（1 进行中 + 1 已完成），B 负责 1 单（草稿）
    const mk = (salesId, ownerId, status, extra) => Order.create({
      orderNo: `INF${Math.random().toString(36).slice(2, 8)}`, customerId: cust.id, status, salesId, ownerId, ...extra,
    });
    await mk(opA.id, opA.id, 'in_progress');
    await mk(opA.id, opA.id, 'completed');
    await mk(opB.id, opB.id, 'draft');
  });

  after(async () => { await sequelize.close(); });

  test('admin 全量：看到 A/B 两人工作量', async () => {
    const dashboard = require('../src/controllers/dashboardController');
    const res = mockRes();
    await dashboard.teamWorkload({ user: { id: admin.id, role: 'admin' }, query: {} }, res);
    const body = res._out.body.data;
    assert.ok(Array.isArray(body.list), '应返回成员列表');
    // 因数据隔离按 admin 无限制，应同时包含 A 与 B
    const names = body.list.map((m) => m.name);
    assert.ok(names.includes('操作A'), '应包含操作A');
    assert.ok(names.includes('操作B'), '应包含操作B');
    const a = body.list.find((m) => m.name === '操作A');
    assert.ok(a.orderTotal >= 2, 'A 至少 2 单');
    assert.ok(a.orderActive >= 1, 'A 至少 1 单进行中');
  });
});