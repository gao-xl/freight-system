// E1 外部跟踪自动拉取
// 定时调用船期/AIS/场站适配器 → 自动写入 ShipmentTrack（auto=true）→ 触发规则引擎预警。
//
// 设计约束：
//  - fail-open：适配器未配置/未启用/查询失败均跳过并告警日志，不中断其他拉取与主流程。
//  - 幂等：同一订单同一外部事件只写一次（remark 存 dedupKey，精确匹配跳过）。
//  - 范围：仅拉取在途订单（已装船/运输中且未到港），避免全量扫描。
//  - 触发预警：船期 ETA 变化写 vessel_change 预警；有新增节点后重跑规则扫描。
//  - 调度：复用 alertScheduler 的 node-cron 入口注册，不另起调度实例。
const cron = require('node-cron');
const { Op } = require('sequelize');
const config = require('../config');
const { Order, ShipmentTrack, IntegrationConfig } = require('../models');
const { IntegrationClient } = require('../integrations');
const { upsertAlert, runAllRules } = require('./alertService');
const { trackJobResult } = require('./jobFailureAlert');
const { logger } = require('../utils/logger');

// 任务配置：适配器编码 → { cron 表达式, 配置开关 key }
const TASKS = {
  ship_schedule: { cron: '0 */6 * * *', switchKey: 'schedule', label: '船期' },
  ais_tracking: { cron: '0 */2 * * *', switchKey: 'ais', label: 'AIS 船位' },
  yard_qingdao: { cron: '0 */4 * * *', switchKey: 'yard', label: '场站状态' },
};

// 场站状态 → 跟踪阶段映射（青岛港场站状态见 yardQingdao 适配器 STATUS_MAP）
const YARD_STAGE = {
  提取: 'delivered',
  放行: 'cleared',
  查验: 'received',
  集港: 'received',
  在场: 'received',
};

const OPERATOR = 'SYSTEM(自动拉取)';
const DEDUP_PREFIX = 'auto:';

// 在途订单：存在装船/运输中节点，且未出现到港/清关/送达节点；订单状态须为进行中
async function findInTransitOrders() {
  const rows = await ShipmentTrack.findAll({
    where: { stage: { [Op.in]: ['loaded', 'in_transit'] } },
    attributes: ['orderId'],
    group: ['orderId'],
  });
  const orderIds = rows.map((t) => t.orderId);
  if (!orderIds.length) return [];
  const arrived = await ShipmentTrack.findAll({
    where: {
      orderId: { [Op.in]: orderIds },
      stage: { [Op.in]: ['arrived', 'cleared', 'delivered'] },
    },
    attributes: ['orderId'],
  });
  const arrivedIds = new Set(arrived.map((t) => t.orderId));
  const targetIds = orderIds.filter((id) => !arrivedIds.has(id));
  if (!targetIds.length) return [];
  return Order.findAll({
    where: { id: { [Op.in]: targetIds }, status: { [Op.in]: ['confirmed', 'in_progress'] } },
  });
}

// 幂等写入跟踪节点：remark 存 dedupKey，命中即跳过
async function upsertAutoTrack({ orderId, stage, location, description, eventTime, dedupKey }) {
  const exist = await ShipmentTrack.findOne({ where: { orderId, auto: true, remark: dedupKey } });
  if (exist) return { created: false };
  await ShipmentTrack.create({
    orderId,
    stage,
    location,
    description,
    eventTime,
    operator: OPERATOR,
    auto: true,
    remark: dedupKey,
  });
  return { created: true };
}

function dayOf(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

// 船期同步：ETA 变化才写节点 + 触发船期变更预警
async function pullShipSchedule(order) {
  const client = await IntegrationClient.get('ship_schedule');
  const raw = await client.query({
    orderNo: order.orderNo,
    originPort: order.originPort,
    destPort: order.destPort,
    etd: order.etd,
    eta: order.eta,
  });
  const d = raw && raw.data ? raw.data : raw;
  const newEta = d && (d.eta || d.etaDate) ? new Date(d.eta || d.etaDate) : null;
  if (!newEta || Number.isNaN(newEta.getTime())) return { skipped: '船期无 eta 返回' };
  const newDay = newEta.toISOString().slice(0, 10);
  if (dayOf(order.eta) === newDay) return { skipped: 'ETA 未变化' };
  const dedupKey = `${DEDUP_PREFIX}ship_schedule:${order.id}:eta:${newDay}`;
  const w = await upsertAutoTrack({
    orderId: order.id,
    stage: 'in_transit',
    location: `${order.originPort || ''}→${order.destPort || ''}`,
    description: `船期同步：预计到港调整为 ${newDay}${d.vessel || d.vesselName ? `（${d.vessel || d.vesselName}）` : ''}`,
    eventTime: new Date(),
    dedupKey,
  });
  if (!w.created) return { skipped: 'ETA 事件已同步过' };
  await upsertAlert({
    type: 'vessel_change',
    level: 'warning',
    orderId: order.id,
    title: '船期变更',
    message: `订单 ${order.orderNo} 预计到港由 ${dayOf(order.eta) || '-'} 调整为 ${newDay}`,
    dueAt: newEta,
    dedupKey: `vessel_change:${order.id}:${newDay}`,
  });
  return { created: 1 };
}

// AIS 船位同步：需 MMSI（订单 customFields.mmsi 或对接配置 config.mmsi），无则跳过
async function pullAis(order) {
  let mmsi = '';
  try { mmsi = (JSON.parse(order.customFields || '{}').mmsi || '').trim(); } catch { /* 忽略非法 JSON */ }
  if (!mmsi) {
    const cfg = await IntegrationConfig.findOne({ where: { code: 'ais_tracking' } });
    try { mmsi = (JSON.parse(cfg?.config || '{}').mmsi || '').trim(); } catch { /* 忽略非法 JSON */ }
  }
  if (!mmsi) return { skipped: '无 MMSI，跳过 AIS' };
  const client = await IntegrationClient.get('ais_tracking');
  const raw = await client.query({ mmsi });
  const rows = raw && Array.isArray(raw.rows) ? raw.rows : [];
  if (!rows.length) return { skipped: 'AIS 无数据' };
  const row = rows[0];
  const lat = Number(row.LAT);
  const lon = Number(row.LON);
  const posKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const dedupKey = `${DEDUP_PREFIX}ais_tracking:${order.id}:${posKey}`;
  const w = await upsertAutoTrack({
    orderId: order.id,
    stage: 'in_transit',
    location: `纬度${lat.toFixed(3)} 经度${lon.toFixed(3)}`,
    description: `AIS 船位更新（MMSI ${mmsi}）`,
    eventTime: new Date(),
    dedupKey,
  });
  return w.created ? { created: 1 } : { skipped: '船位未变化' };
}

// 场站状态同步：需箱号，无则跳过
async function pullYard(order) {
  if (!order.containerNo) return { skipped: '无箱号，跳过场站' };
  const client = await IntegrationClient.get('yard_qingdao');
  const raw = await client.query({ containerNo: order.containerNo, billNo: order.orderNo, yardCode: order.terminal || '' });
  if (!raw || !raw.status) return { skipped: '场站无状态返回' };
  const stage = YARD_STAGE[raw.status] || 'received';
  const eventTime = raw.eventTime ? new Date(raw.eventTime) : new Date();
  const dedupKey = `${DEDUP_PREFIX}yard_qingdao:${order.id}:${order.containerNo}:${raw.status}:${eventTime.getTime()}`;
  const w = await upsertAutoTrack({
    orderId: order.id,
    stage,
    location: raw.location || raw.yardName || '',
    description: `场站同步：${raw.yardName || raw.yardCode || '场站'} ${raw.status}`,
    eventTime,
    dedupKey,
  });
  return w.created ? { created: 1 } : { skipped: '场站事件已同步' };
}

function pullWith(task, order) {
  if (task === 'ship_schedule') return pullShipSchedule(order);
  if (task === 'ais_tracking') return pullAis(order);
  if (task === 'yard_qingdao') return pullYard(order);
  return Promise.resolve({ skipped: `未知任务 ${task}` });
}

// 对一批订单执行单个适配器拉取（fail-open：单个失败仅记录日志）
async function pullTaskForOrders(task, orders) {
  let created = 0;
  let skipped = 0;
  for (const order of orders) {
    try {
      const r = await pullWith(task, order);
      created += r.created || 0;
      if (r.skipped) skipped += 1;
    } catch (e) {
      logger.warn(`[TRACK-PULL] ${task} 拉取失败（fail-open，跳过）`, { orderNo: order.orderNo, message: e.message });
    }
  }
  if (created > 0) {
    await IntegrationConfig.update({ lastSyncAt: new Date() }, { where: { code: task } }).catch(() => {});
  }
  return { created, skipped };
}

// 执行全部任务（供定时启动/测试/手动触发调用）
async function runTrackingAutoPull() {
  if (!config.trackAutoPull.enabled) return { disabled: true };
  const t0 = Date.now();
  const result = { orders: 0, created: 0, skipped: 0, errors: [] };
  try {
    const orders = await findInTransitOrders();
    result.orders = orders.length;
    for (const task of Object.keys(TASKS)) {
      if (!config.trackAutoPull[TASKS[task].switchKey]) continue;
      const r = await pullTaskForOrders(task, orders);
      result.created += r.created;
      result.skipped += r.skipped;
    }
    // 触发规则引擎：新增节点后重扫规则（ETA 临近/DB 规则），确保预警及时
    if (result.created > 0) {
      runAllRules().catch((e) => logger.error('[TRACK-PULL] 规则重扫失败', { message: e.message }));
    }
    // 成功执行：清零失败计数
    await trackJobResult('tracking:auto-pull', null);
  } catch (e) {
    logger.error('[TRACK-PULL] 拉取任务异常', { message: e.message });
    result.errors.push(`global:${e.message}`);
    // 失败告警：连续失败达到阈值时推送（成功时清零）
    await trackJobResult('tracking:auto-pull', e);
  }
  logger.info(`[TRACK-PULL] 完成：订单 ${result.orders}，新增节点 ${result.created}，跳过 ${result.skipped}，耗时 ${Date.now() - t0}ms`);
  return result;
}

// 单任务拉取（供各自 cron 间隔使用）
async function runTrackingAutoPullTask(task) {
  if (!config.trackAutoPull.enabled || !config.trackAutoPull[TASKS[task].switchKey]) return { task, skipped: 0, created: 0 };
  const orders = await findInTransitOrders();
  const r = await pullTaskForOrders(task, orders);
  if (r.created > 0) {
    runAllRules().catch((e) => logger.error('[TRACK-PULL] 规则重扫失败', { message: e.message }));
  }
  return { task, ...r };
}

// 注册定时任务（由 alertScheduler 调用，复用同一调度入口）
function startTrackingAutoPull() {
  if (!config.trackAutoPull.enabled) {
    logger.info('[TRACK-PULL] 外部跟踪自动拉取已关闭（TRACK_AUTO_PULL=off）');
    return [];
  }
  const jobs = [];
  for (const [task, conf] of Object.entries(TASKS)) {
    if (!config.trackAutoPull[conf.switchKey]) continue;
    let running = false;
    jobs.push(cron.schedule(conf.cron, async () => {
      if (running) return;
      running = true;
      try { await runTrackingAutoPullTask(task); } finally { running = false; }
    }));
  }
  // 启动即执行一次，便于开发环境立即看到结果
  runTrackingAutoPull().catch((e) => logger.error('[TRACK-PULL] 首次执行失败', { message: e.message }));
  logger.info('[TRACK-PULL] 外部跟踪自动拉取已注册（船期 6h / AIS 2h / 场站 4h）');
  return jobs;
}

module.exports = {
  TASKS,
  findInTransitOrders,
  pullShipSchedule,
  pullAis,
  pullYard,
  runTrackingAutoPull,
  runTrackingAutoPullTask,
  startTrackingAutoPull,
};
