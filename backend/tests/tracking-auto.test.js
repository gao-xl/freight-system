// E1 外部跟踪自动拉取测试
// 覆盖：在途订单拉取 → ShipmentTrack auto 写入 → ETA 预警 → 幂等不重复 → 缺 key/适配器失败 fail-open → 非在途订单不拉取
// 运行：npm test（与 smoke/pdf/onboarding 串行；独立空库，不污染其他测试）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');

// 独立测试库（PostgreSQL，与生产方言一致），须在 require 模型前设置
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tracking-test-secret-' + Math.random().toString(36).slice(2);
process.env.DB_DIALECT = 'postgres';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'freight_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'freight';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';

const config = require('../src/config');
const { sequelize, Customer, Order, ShipmentTrack, AlertRecord, IntegrationConfig } = require('../src/models');
const { adapters } = require('../src/integrations');
const { runTrackingAutoPull } = require('../src/services/trackingAutoPull');

// 固定 mock 返回（保证幂等可复现）
const SCHEDULE_ETA = '2026-09-05';
const AIS_POS = { LAT: 36.1, LON: 120.2 };
const AIS_POS_2 = { LAT: 36.2, LON: 120.3 };
const YARD_EVENT = '2026-08-09T10:00:00.000Z';

// 备份原始适配器 query，测试后恢复
const originalQueries = {};
for (const code of ['ship_schedule', 'ais_tracking', 'yard_qingdao']) {
  originalQueries[code] = adapters[code].query;
}

let order;
let draftOrder;

describe('外部跟踪自动拉取（E1）', () => {
  before(async () => {
    await sequelize.sync({ force: true });
    const customer = await Customer.create({ code: 'E1CUST', name: 'E1测试客户' });
    // 在途订单：已装船 + 进行中
    order = await Order.create({
      orderNo: 'SO-E1-001',
      customerId: customer.id,
      type: 'export',
      mode: 'sea',
      originPort: '青岛',
      destPort: '鹿特丹',
      containerNo: 'E1BOX0000001',
      eta: '2026-09-10',
      status: 'in_progress',
      customFields: JSON.stringify({ mmsi: '412000123' }),
    });
    await ShipmentTrack.create({ orderId: order.id, stage: 'loaded', description: '测试在途', auto: true });
    // 草稿订单：不应被拉取
    draftOrder = await Order.create({
      orderNo: 'SO-E1-DRAFT',
      customerId: customer.id,
      type: 'export',
      mode: 'sea',
      eta: '2026-09-20',
      status: 'draft',
    });
    // 启用三个跟踪相关适配器
    await IntegrationConfig.bulkCreate([
      { code: 'ship_schedule', name: '船期查询', baseUrl: 'http://mock-schedule', apiKey: 'k', enabled: true },
      { code: 'ais_tracking', name: 'AIS 船舶追踪', apiKey: 'k', enabled: true },
      { code: 'yard_qingdao', name: '青岛港场站', baseUrl: 'http://mock-yard', apiKey: 'k', enabled: true },
    ]);
  });

  after(async () => {
    for (const code of Object.keys(originalQueries)) adapters[code].query = originalQueries[code];
    await sequelize.close();
  });

  test('配置启用时：在途订单写入 auto 跟踪节点并触发 ETA 预警', async () => {
    adapters['ship_schedule'].query = async () => ({ eta: SCHEDULE_ETA, vessel: 'TEST VESSEL' });
    adapters['ais_tracking'].query = async () => ({ rows: [AIS_POS] });
    adapters['yard_qingdao'].query = async () => ({
      containerNo: order.containerNo,
      billNo: order.orderNo,
      yardCode: 'qqct',
      yardName: 'QQCT场站',
      status: '在场',
      location: 'A区',
      eventTime: YARD_EVENT,
    });

    const result = await runTrackingAutoPull();

    assert.equal(result.orders, 1, '仅应拉取在途订单（草稿订单被过滤）');
    assert.equal(result.created, 3, `船期/船位/场站各新增 1 节点，实际 ${result.created}`);
    assert.equal(result.errors.length, 0);

    // 船期节点：auto 标记 + remark 来源 dedupKey
    const sched = await ShipmentTrack.findOne({
      where: { orderId: order.id, auto: true, remark: `auto:ship_schedule:${order.id}:eta:${SCHEDULE_ETA}` },
    });
    assert.ok(sched, '应写入船期同步节点');
    assert.equal(sched.operator, 'SYSTEM(自动拉取)');

    // ETA 预警（船期变更）
    const alert = await AlertRecord.findOne({
      where: { orderId: order.id, type: 'vessel_change', dedupKey: `vessel_change:${order.id}:${SCHEDULE_ETA}` },
    });
    assert.ok(alert, '应产生船期变更预警');

    // 场站节点
    const yard = await ShipmentTrack.findOne({
      where: { orderId: order.id, remark: `auto:yard_qingdao:${order.id}:${order.containerNo}:在场:${Date.parse(YARD_EVENT)}` },
    });
    assert.ok(yard, '应写入场站同步节点');
  });

  test('幂等：同一事件二次拉取不重复写入', async () => {
    const result = await runTrackingAutoPull();
    assert.equal(result.created, 0, '二次拉取不应新增节点');
    const schedCount = await ShipmentTrack.count({
      where: { orderId: order.id, remark: `auto:ship_schedule:${order.id}:eta:${SCHEDULE_ETA}` },
    });
    assert.equal(schedCount, 1, '船期节点不应重复');
    const alertCount = await AlertRecord.count({
      where: { dedupKey: `vessel_change:${order.id}:${SCHEDULE_ETA}` },
    });
    assert.equal(alertCount, 1, '预警不应重复');
  });

  test('fail-open：适配器失败/未配置跳过，不影响其他拉取', async () => {
    // 场站未启用（缺 key 场景）
    await IntegrationConfig.update({ enabled: false }, { where: { code: 'yard_qingdao' } });
    // 船期上游失败（模拟超时/网络异常）
    adapters['ship_schedule'].query = async () => { throw new Error('模拟上游超时'); };
    // AIS 返回新船位 → 应正常写入
    adapters['ais_tracking'].query = async () => ({ rows: [AIS_POS_2] });

    const result = await runTrackingAutoPull();
    assert.equal(result.errors.length, 0, 'fail-open：不应抛致命错误');
    assert.equal(result.created, 1, '仅 AIS 新增（船期失败、场站未启用）');

    const ais2 = await ShipmentTrack.findOne({
      where: { orderId: order.id, remark: `auto:ais_tracking:${order.id}:${AIS_POS_2.LAT.toFixed(3)},${AIS_POS_2.LON.toFixed(3)}` },
    });
    assert.ok(ais2, 'AIS 拉取不受船期失败影响');
  });

  test('仅在途订单被拉取：草稿订单不产生自动节点', async () => {
    const draftTracks = await ShipmentTrack.count({ where: { orderId: draftOrder.id, auto: true } });
    assert.equal(draftTracks, 0, '草稿订单不应被拉取');
  });

  test('总开关 TRACK_AUTO_PULL=off 时跳过拉取', async () => {
    const prev = config.trackAutoPull.enabled;
    config.trackAutoPull.enabled = false;
    try {
      const r = await runTrackingAutoPull();
      assert.deepEqual(r, { disabled: true });
    } finally {
      config.trackAutoPull.enabled = prev;
    }
  });
});
