// F6 消息订阅偏好（增强）测试
// 覆盖：缺省全开 → 关闭某分类后该分类不再落库、其他分类仍落库；
//       GET/PUT 读写偏好；数据隔离（A 关闭不影响 B）；重新开启恢复。
// 运行：npm test（独立空库，不污染其他测试）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');

// 独立测试库（PostgreSQL，与生产方言一致），须在 require 模型前设置
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'pref-test-secret-' + Math.random().toString(36).slice(2);
process.env.DB_DIALECT = 'postgres';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'freight_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'freight';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';

const { sequelize, User, MessageRecord } = require('../src/models');
const realtime = require('../src/services/realtimeService');
const events = require('../src/services/eventBus');
const messageController = require('../src/controllers/messageController');

async function waitFor(fn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 30));
  }
  return null;
}

function mockRes() {
  const out = { status: 200, body: null };
  return {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; },
    _out: out,
  };
}

const CATS = realtime.CATEGORIES;

describe('消息订阅偏好（F6 增强）', () => {
  let userA;
  let userB;
  before(async () => {
    await sequelize.sync({ force: true });
    userA = await User.create({ username: 'pref_a', name: '用户A', password: 'x', status: 'active' });
    userB = await User.create({ username: 'pref_b', name: '用户B', password: 'x', status: 'active' });
    realtime.subscribe();
  });

  after(async () => { await sequelize.close(); });

  test('缺省（无偏好行）→ 全分类为活跃用户生成消息', async () => {
    const beforeCount = await MessageRecord.count();
    events.emit('finance.created', { financeId: 1, amount: '100.00' });
    const rows = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'finance' } });
      return r.length >= 2 ? r : null;
    });
    assert.ok(rows, '应生成财务消息');
    const a = rows.find((r) => r.userId === userA.id);
    const b = rows.find((r) => r.userId === userB.id);
    assert.ok(a && b, '两个活跃用户都应收到');
    assert.equal(beforeCount, 0, '前置无消息');
  });

  test('GET /message-preferences 缺省全开', async () => {
    const res = mockRes();
    await messageController.getPrefs({ user: { id: userA.id }, query: {} }, res);
    const prefs = res._out.body.data.prefs;
    for (const c of CATS) assert.equal(prefs[c], true, `${c} 缺省应开启`);
  });

  test('A 关闭财务 → finance 事件不再为 A 生成，alert 仍生成【数据隔离】', async () => {
    const res = mockRes();
    await messageController.updatePrefs({ user: { id: userA.id }, body: { prefs: { ...Object.fromEntries(CATS.map((c) => [c, true])), finance: false } } }, res);
    assert.equal(res._out.body.data.prefs.finance, false, 'A 财务应关闭');

    // 触发财务事件：A 不应收到，B 仍应收到
    events.emit('finance.created', { financeId: 2, amount: '200.00' });
    const fin = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'finance', refId: 2 } });
      return r.length ? r : null;
    });
    assert.ok(fin.length >= 1, '财务事件应落库');
    const aGot = fin.find((r) => r.userId === userA.id);
    const bGot = fin.find((r) => r.userId === userB.id);
    assert.equal(aGot, undefined, 'A 关闭财务后不应收到财务消息');
    assert.ok(bGot, 'B 仍应收到财务消息');

    // 触发预警事件：A 仍应收到（未关闭）
    events.emit('alert.created', { alertId: 9, type: 'eta_soon', level: 'warning', title: 'ETA临近', message: '测试' });
    const al = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'alert', refId: 9 } });
      return r.length >= 2 ? r : null;
    });
    assert.ok(al, '预警消息应生成');
    const aAlert = al.find((r) => r.userId === userA.id);
    assert.ok(aAlert, 'A 未关闭预警，仍应收到');
  });

  test('A 重新开启财务 → 恢复生成', async () => {
    const res = mockRes();
    await messageController.updatePrefs({ user: { id: userA.id }, body: { prefs: Object.fromEntries(CATS.map((c) => [c, true])) } }, res);
    assert.equal(res._out.body.data.prefs.finance, true, 'A 财务应重新开启');

    events.emit('finance.created', { financeId: 3, amount: '300.00' });
    const fin = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'finance', refId: 3, userId: userA.id } });
      return r.length ? r : null;
    });
    assert.ok(fin, 'A 重新开启后应恢复收到财务消息');
  });

  test('GET 反映已保存偏好（B 保持全开）', async () => {
    const res = mockRes();
    await messageController.getPrefs({ user: { id: userB.id }, query: {} }, res);
    const prefs = res._out.body.data.prefs;
    for (const c of CATS) assert.equal(prefs[c], true, `B ${c} 应全开`);
  });
});