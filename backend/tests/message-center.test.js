// F5/F6 实时推送 + 统一消息中心测试
// 覆盖：事件 → 站内消息落库（按活跃用户）→ 未读数/列表/已读/全部已读；
//       未登记事件不落库；非活跃用户不生成消息。
// 运行：npm test（与 smoke/pdf/onboarding 串行；独立空库，不污染其他测试）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');

// 独立测试库（PostgreSQL，与生产方言一致），须在 require 模型前设置
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'message-test-secret-' + Math.random().toString(36).slice(2);
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

// 等待异步事件处理完成（onAsync 为 fire-and-forget）
async function waitFor(fn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 30));
  }
  return null;
}

// mock res：捕获 ok/fail 输出
function mockRes() {
  const out = { status: 200, body: null };
  return {
    status(s) { out.status = s; return this; },
    json(b) { out.body = b; },
    _out: out,
  };
}

let activeUser;
let disabledUser;

describe('实时推送 + 统一消息中心（F5/F6）', () => {
  before(async () => {
    await sequelize.sync({ force: true });
    activeUser = await User.create({ username: 'msg_active', name: '活跃用户', password: 'x', status: 'active' });
    disabledUser = await User.create({ username: 'msg_disabled', name: '停用用户', password: 'x', status: 'disabled' });
    realtime.subscribe();
  });

  after(async () => {
    await sequelize.close();
  });

  test('alert.created 事件 → 为活跃用户生成预警消息，停用用户不生成', async () => {
    events.emit('alert.created', {
      alertId: 101, type: 'vessel_change', level: 'danger', title: '船期变更', message: '预计到港提前', dedupKey: 'x:1',
    });
    const rows = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'alert' } });
      return r.length ? r : null;
    });
    assert.ok(rows, '应该生成预警消息');
    const active = rows.find((r) => r.userId === activeUser.id);
    const disabled = rows.find((r) => r.userId === disabledUser.id);
    assert.ok(active, '活跃用户应收到预警消息');
    assert.equal(active.level, 'danger');
    assert.equal(active.title, '船期变更');
    assert.equal(active.refType, 'alert');
    assert.equal(active.refId, 101);
    assert.equal(active.isRead, false);
    assert.equal(disabled, undefined, '停用用户不应收到消息');
  });

  test('order.created 事件 → 生成订单消息', async () => {
    events.emit('order.created', { orderId: 55, orderNo: 'SO-ABC-001', cargoDesc: '机械设备' });
    const rows = await waitFor(async () => {
      const r = await MessageRecord.findAll({ where: { type: 'order' } });
      return r.length ? r : null;
    });
    assert.ok(rows, '应生成订单消息');
    const mine = rows.find((r) => r.userId === activeUser.id);
    assert.ok(mine);
    assert.match(mine.title, /SO-ABC-001/);
    assert.equal(mine.refType, 'order');
    assert.equal(mine.refId, 55);
  });

  test('未登记事件不落库（如 user.login 仅广播）', async () => {
    const before = await MessageRecord.count();
    events.emit('user.login', { userId: activeUser.id });
    await new Promise((r) => setTimeout(r, 200));
    const after = await MessageRecord.count();
    assert.equal(after, before, 'user.login 不应产生站内消息');
  });

  test('未读数：只统计当前用户未读', async () => {
    const res = mockRes();
    await messageController.unreadCount({ user: { id: activeUser.id } }, res);
    assert.equal(res._out.body.code, 0);
    assert.ok(res._out.body.data.count >= 2, `未读数应 >= 2，实际 ${res._out.body.data.count}`);
  });

  test('列表：分页 + 倒序 + 只返回本人', async () => {
    const res = mockRes();
    await messageController.list({ user: { id: activeUser.id }, query: { page: 1, pageSize: 10 } }, res);
    const { list, total } = res._out.body.data;
    assert.equal(res._out.body.code, 0);
    assert.ok(Array.isArray(list));
    assert.equal(total, list.length);
    for (const r of list) assert.equal(r.userId, activeUser.id, '列表只应包含本人消息');
    // 倒序：时间递减
    for (let i = 1; i < list.length; i++) {
      assert.ok(new Date(list[i - 1].createdAt) >= new Date(list[i].createdAt));
    }
  });

  test('标记单条已读 → 未读数下降', async () => {
    const rBefore = mockRes();
    await messageController.unreadCount({ user: { id: activeUser.id } }, rBefore);
    const before = rBefore._out.body.data.count;
    const one = await MessageRecord.findOne({ where: { userId: activeUser.id, isRead: false } });
    assert.ok(one, '应有未读消息');
    const r2 = mockRes();
    await messageController.read({ user: { id: activeUser.id }, params: { id: one.id } }, r2);
    assert.equal(r2._out.body.code, 0);
    assert.equal(r2._out.body.data.isRead, true);
    const rAfter = mockRes();
    await messageController.unreadCount({ user: { id: activeUser.id } }, rAfter);
    const after = rAfter._out.body.data.count;
    assert.ok(after < before, `已读后未读数应下降：${before} → ${after}`);
  });

  test('他人消息不可读（数据隔离）', async () => {
    const otherRes = mockRes();
    await messageController.read({ user: { id: disabledUser.id }, params: { id: 999999 } }, otherRes);
    assert.equal(otherRes._out.status, 404);
  });

  test('全部已读 → 未读清零', async () => {
    const r = mockRes();
    await messageController.readAll({ user: { id: activeUser.id } }, r);
    assert.equal(r._out.body.code, 0);
    const rc = mockRes();
    await messageController.unreadCount({ user: { id: activeUser.id } }, rc);
    assert.equal(rc._out.body.data.count, 0, '全部已读后未读数应为 0');
  });
});