// E2 通知推送测试
// 覆盖：预警产生 → 已配置渠道推送（email/wechat_webhook/webhook）→ 记录落库可查；
//       渠道缺配置跳过不报错；推送失败记录 status=failed 不抛致命错误；业务事件可选订阅。
// 运行：npm test（与 smoke/pdf/onboarding/tracking-auto 串行；独立空库，不污染其他测试）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');

// 独立测试库文件（data/*.db 已 gitignore），须在 require 模型前设置
const DB_STORAGE = `./data/_notification_test_${Date.now()}.db`;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'notification-test-secret-' + Math.random().toString(36).slice(2);
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = process.env.TEST_DB_STORAGE || DB_STORAGE;

const config = require('../src/config');
const { sequelize, NotificationRecord, AlertRecord, Customer, Order } = require('../src/models');
const notificationService = require('../src/services/notificationService');
const { upsertAlert } = require('../src/services/alertService');
const events = require('../src/services/eventBus');

// ── mock：邮件与 Webhook ──
const nodemailer = require('nodemailer');
const originalCreateTransport = nodemailer.createTransport;
const originalFetch = global.fetch;
let sendMailCalls = 0;
let fetchBehavior = { ok: true, errcode: 0 }; // 切换失败场景用

function installMocks() {
  sendMailCalls = 0;
  nodemailer.createTransport = () => ({
    sendMail: async () => { sendMailCalls += 1; return { messageId: 'mock-1' }; },
  });
  global.fetch = async () => {
    if (fetchBehavior.ok === false) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ errcode: fetchBehavior.errcode }) };
  };
}

function restoreMocks() {
  nodemailer.createTransport = originalCreateTransport;
  global.fetch = originalFetch;
}

// 全渠道配置（默认三渠道均启用）
function enableAllChannels() {
  config.notification = {
    smtpHost: 'smtp.test.local',
    smtpPort: 465,
    smtpUser: 'noreply@test.local',
    smtpPass: '',
    smtpFrom: '货代系统 <noreply@test.local>',
    emailTo: 'ops@test.local,manager@test.local',
    smtpEnabled: true,
    wechatWebhook: 'https://mock-wechat/webhook',
    wechatEnabled: true,
    webhookUrl: 'https://mock-webhook/hook',
    webhookEnabled: true,
    businessEvents: 'order.created',
  };
}

function disableAllChannels() {
  config.notification = {
    smtpHost: '', smtpPort: 465, smtpUser: '', smtpPass: '', smtpFrom: '', emailTo: '', smtpEnabled: true,
    wechatWebhook: '', wechatEnabled: true,
    webhookUrl: '', webhookEnabled: true,
    businessEvents: '',
  };
}

async function waitFor(fn, timeout = 4000, interval = 25) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor 超时');
    await new Promise((r) => setTimeout(r, interval));
  }
}

describe('通知推送（E2）', () => {
  let orderId;
  let alertId;
  before(async () => {
    installMocks();
    await sequelize.sync({ force: true });
    const customer = await Customer.create({ code: 'E2CUST', name: 'E2测试客户' });
    const order = await Order.create({
      orderNo: 'SO-E2-001',
      customerId: customer.id,
      type: 'export',
      mode: 'sea',
      eta: '2026-09-05',
      status: 'in_progress',
    });
    orderId = order.id;
    enableAllChannels();
    // 订阅：alert.created / alert.resolved + NOTIFY_BUSINESS_EVENTS=order.created
    notificationService.subscribe();
  });

  after(async () => {
    restoreMocks();
    await sequelize.close();
  });

  test('预警产生（upsertAlert 新建）→ 已配置渠道自动推送并落库', async () => {
    await upsertAlert({
      type: 'eta_soon',
      level: 'warning',
      orderId,
      title: 'ETA 临近',
      message: '订单 SO-E2-001 预计 2 天后到港',
      dueAt: new Date(),
      dedupKey: 'e2:eta_soon:1',
    });

    const records = await waitFor(async () => {
      const rows = await NotificationRecord.findAll({ where: { eventType: 'alert.created' } });
      return rows.length >= 3 ? rows : null;
    });

    const channels = records.map((r) => r.channel).sort();
    // 字典序：'webhook' < 'wechat_webhook'（第 3 字符 b < c），不可手写期望顺序
    assert.deepEqual(channels, ['email', 'webhook', 'wechat_webhook'], '三个已配置渠道均应推送');
    for (const r of records) {
      assert.equal(r.status, 'sent', `${r.channel} 应推送成功`);
      assert.ok(r.payload && r.payload.includes('ETA 临近'), `${r.channel} 应记录内容摘要`);
      assert.ok(r.sentAt, '应记录推送时间');
    }
    alertId = records[0].targetId;
    assert.ok(alertId, '应关联到预警 ID');
    assert.ok(sendMailCalls >= 1, '邮件渠道应被调用');
  });

  test('推送记录可查询（listRecords 按事件/渠道/状态过滤）', async () => {
    const byEvent = await notificationService.listRecords({ eventType: 'alert.created', pageSize: 50 });
    assert.ok(byEvent.total >= 3, '应可查预警推送记录');

    const byChannel = await notificationService.listRecords({ channel: 'wechat_webhook', status: 'sent' });
    assert.ok(byChannel.total >= 1, '按渠道+状态过滤应命中');

    const byTarget = await notificationService.listRecords({ targetId: alertId });
    assert.ok(byTarget.total >= 1, '按业务对象过滤应命中');
  });

  test('业务事件可选订阅（order.created）同样推送并落库', async () => {
    events.emit('order.created', { orderId: 42, orderNo: 'SO-E2-042', customerId: 7 });
    const rows = await waitFor(async () => {
      const rs = await NotificationRecord.findAll({ where: { eventType: 'order.created' } });
      return rs.length >= 3 ? rs : null;
    });
    assert.equal(rows.length, 3, '三渠道均应推送订单事件');
  });

  test('推送失败记录 status=failed，不抛致命错误', async () => {
    fetchBehavior = { ok: false, errcode: -1 };
    try {
      const r = await notificationService.push({
        eventType: 'alert.created',
        targetType: 'alert',
        targetId: 999,
        payload: { title: '失败场景', message: '模拟上游不可达' },
      });
      assert.equal(r.length, 3, '三渠道都应尝试');
      // email 走 nodemailer mock 恒成功（sent）；webhook/企微走 fetch mock（ok:false → failed）
      const emailRec = r.find((rec) => rec.channel === 'email');
      assert.equal(emailRec.status, 'sent', 'email mock 恒成功');
      for (const rec of r) {
        if (rec.channel === 'email') continue;
        assert.equal(rec.status, 'failed', `${rec.channel} 失败应记录 failed`);
        assert.ok(rec.error && rec.error.length > 0, `${rec.channel} 应记录失败原因`);
      }
      // 落库可查
      const rows = await NotificationRecord.findAll({ where: { targetId: 999 } });
      assert.equal(rows.length, 3, '失败记录应落库');
      for (const row of rows) {
        if (row.channel === 'email') {
          assert.equal(row.status, 'sent', 'email mock 恒成功');
        } else {
          assert.equal(row.status, 'failed', `${row.channel} 失败应落库为 failed`);
        }
      }
    } finally {
      fetchBehavior = { ok: true, errcode: 0 };
    }
  });

  test('渠道缺配置跳过不报错（无记录、无异常）', async () => {
    disableAllChannels();
    try {
      const r = await notificationService.push({
        eventType: 'alert.created',
        targetType: 'alert',
        targetId: 888,
        payload: { title: '缺配置', message: '不应推送' },
      });
      assert.deepEqual(r, [], '缺配置渠道应全部跳过');
      const rows = await NotificationRecord.findAll({ where: { targetId: 888 } });
      assert.equal(rows.length, 0, '缺配置不应产生推送记录');
    } finally {
      enableAllChannels();
    }
  });

  test('预警幂等：同 dedupKey 二次 upsert 不重复触发推送', async () => {
    const before = await NotificationRecord.count({ where: { eventType: 'alert.created' } });
    // 同 dedupKey 再次 upsert → 命中已有，走 update 分支，不应再 emit alert.created
    await upsertAlert({
      type: 'eta_soon',
      level: 'danger',
      orderId,
      title: 'ETA 临近（更新）',
      message: '订单 SO-E2-001 预计 1 天后到港',
      dueAt: new Date(),
      dedupKey: 'e2:eta_soon:1',
    });
    // 给事件异步处理留一点时间
    await new Promise((r) => setTimeout(r, 200));
    const after = await NotificationRecord.count({ where: { eventType: 'alert.created' } });
    assert.equal(after, before, '重复预警不应重复推送');
    const alert = await AlertRecord.findOne({ where: { dedupKey: 'e2:eta_soon:1' } });
    assert.equal(alert.level, 'danger', '已存在预警应被更新而非新建');
  });

  test('notification 插件（配置/兼容面）可正常加载', async () => {
    const mod = require('../src/modules/notification');
    assert.equal(mod.name, 'notification');
    assert.equal(typeof mod.routes, 'function', '应保留配置接口');
    assert.ok(Array.isArray(mod.events), '应声明关注事件');
  });
});
