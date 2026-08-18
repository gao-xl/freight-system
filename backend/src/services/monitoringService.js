'use strict';

// P3-3 运维监控增强服务
// 职责：
//   1. 指标结算：聚合 metricsService 的滚动速率/秒表 + DB 连接池 + 事件循环延迟 + 缓存命中，输出 JSON 快照
//   2. 告警规则：规则持久化于 IntegrationConfig(code=monitor_rules)，逐条评估，命中写入 AlertRecord(type=blocked)，
//      回落自动 resolve；告警落库经 upsertAlert 触发 alert.created 事件，由 notificationService 推送出站通知。
//   3. 流程节点超时自动升级：扫描 in_progress 订单，当前未完成流程节点停滞超过阈值（小时）时，
//      自动升级预警并标记节点为 blocked；节点完成后自动结案。
// 零阻塞：采样/评估异常只记日志，绝不中断请求或主循环。

const cron = require('node-cron');
const { Op } = require('sequelize');
const metricsService = require('./metricsService');
const cacheService = require('./cacheService');
const { sequelize, IntegrationConfig, AlertRecord, Order, OrderNode, FlowNode } = require('./dataAccess');
const { upsertAlert } = require('./alertService');
const config = require('../config');
const { logger } = require('../utils/logger');

// ── 默认告警规则 ──
// field: 快照内的点路径；compare: >= 或 >；value: 触发阈值；level: 预警等级；unit: 单位（仅展示）
const DEFAULT_RULES = [
  { key: 'error_rate_5xx', field: 'rates.errorRate5xx', compare: '>=', value: 5, unit: '%', level: 'danger', enabled: true, title: '5xx 错误率过高', message: '最近 60 秒 5xx 错误率 {{current}}{{unit}}，超过阈值 {{value}}{{unit}}' },
  { key: 'qps_spike', field: 'rates.qps', compare: '>=', value: 50, unit: 'req/s', level: 'warning', enabled: false, title: 'QPS 过高', message: '最近 60 秒平均 QPS {{current}}{{unit}}，超过阈值 {{value}}{{unit}}' },
  { key: 'latency_p95', field: 'latency.p95', compare: '>=', value: 2, unit: 's', level: 'warning', enabled: true, title: 'P95 响应延迟过高', message: 'P95 延迟 {{current}}{{unit}}，超过阈值 {{value}}{{unit}}' },
  { key: 'db_pool_peak', field: 'db.usedPct', compare: '>=', value: 90, unit: '%', level: 'danger', enabled: true, title: '数据库连接池使用率过高', message: '连接池使用率 {{current}}{{unit}}，超过阈值 {{value}}{{unit}}' },
  { key: 'event_loop_lag', field: 'process.eventLoopLagMs', compare: '>=', value: 200, unit: 'ms', level: 'warning', enabled: true, title: '事件循环延迟过高', message: '事件循环延迟 {{current}}{{unit}}，超过阈值 {{value}}{{unit}}' },
  { key: 'node_timeout', field: 'node.timeoutHours', compare: '>=', value: 48, unit: 'h', level: 'warning', enabled: true, title: '流程节点超时未完成', message: '订单流程节点停滞超过 {{value}}{{unit}}，已自动升级' },
];

function normalizeRules(raw) {
  if (!Array.isArray(raw)) return JSON.parse(JSON.stringify(DEFAULT_RULES));
  // 以默认规则为骨架，合并存量配置（保留用户改过的开关/阈值，忽略未知键）
  return DEFAULT_RULES.map((def) => {
    const saved = raw.find((r) => r && r.key === def.key);
    return saved ? { ...def, ...saved } : { ...def };
  });
}

// 读取规则（默认值兜底）
async function loadRules() {
  try {
    const cfg = await IntegrationConfig.findOne({ where: { code: 'monitor_rules' } });
    if (!cfg) return normalizeRules(null);
    let parsed = null;
    try { parsed = cfg.config ? JSON.parse(cfg.config) : null; } catch { parsed = null; }
    return normalizeRules(parsed && parsed.rules);
  } catch (e) {
    logger.warn('[MONITOR] 读取规则失败，使用默认', { message: e.message });
    return normalizeRules(null);
  }
}

// 保存规则（整表覆盖；正常保存时应传入完整归一化后的规则列表）
async function saveRules(rules) {
  const normalized = normalizeRules(rules);
  const configJson = JSON.stringify({ rules: normalized });
  const existing = await IntegrationConfig.findOne({ where: { code: 'monitor_rules' } });
  if (existing) {
    await existing.update({ name: '监控告警规则', config: configJson, enabled: true, remark: 'P3-3 运维监控告警阈值配置' });
  } else {
    await IntegrationConfig.create({
      code: 'monitor_rules', name: '监控告警规则', authType: 'none', enabled: true, config: configJson,
      remark: 'P3-3 运维监控告警阈值配置',
    });
  }
  return normalized;
}

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// 当前是否触发（compare 支持 >= 与 >）
function fired(rule, current) {
  if (current == null) return false;
  return rule.compare === '>' ? current > rule.value : current >= rule.value;
}

// ── 快照组装 ──
let lastDbPool = null;
async function sampleDb() {
  try {
    const pool = sequelize?.connectionManager?.pool;
    if (!pool) return null;
    const total = Number.isFinite(pool.totalCount) ? pool.totalCount : 0;
    const idle = Number.isFinite(pool.idleCount) ? pool.idleCount : 0;
    const available = Number.isFinite(pool.availableCount) ? pool.availableCount : Math.max(total - idle, 0);
    const maxTotal = pool.options && Number.isFinite(pool.options.max) ? pool.options.max : (config.db.pool && config.db.pool.max) || 30;
    lastDbPool = { used: Math.max(total - idle, 0), idle, available, maxTotal };
  } catch (e) { lastDbPool = lastDbPool; }
  return lastDbPool;
}

async function pingDb() {
  try {
    const t0 = Date.now();
    await sequelize.query('SELECT 1');
    return Date.now() - t0;
  } catch (e) { return null; }
}

async function activeAlertCount() {
  try { return await AlertRecord.count({ where: { status: 'active' } }); }
  catch (e) { return null; }
}

// 完整监控快照（含 DB 池 / 延迟 / 缓存 / 在途预警）
async function buildSnapshot() {
  const [dbPool, dbPingMs, activeAlerts] = await Promise.all([sampleDb(), pingDb(), activeAlertCount()]);
  const raw = metricsService.snapshot({ dbPool, dbPingMs, activeAlerts });
  try {
    const s = cacheService.getStats();
    const total = (s.hits || 0) + (s.misses || 0);
    raw.cache = { hitRate: total > 0 ? Math.round((s.hits / total) * 10000) / 100 : 0, mode: s.mode, hits: s.hits, misses: s.misses };
  } catch (e) { raw.cache = null; }
  return raw;
}

// ── 规则评估 ──
// 返回 { firing: [...], all: [{...rule, current, firing}] }
// node_timeout 由 escalateStuckNodes 独立结算（基于订单节点脏数据扫描），不在此做阈值比较，
// 仅回填其阈值便于展示，避免制造虚假的「mon:node_timeout」基础设施预警。
async function evaluate(rules, snapshot) {
  const all = rules.map((rule) => {
    const isNodeRule = rule.key === 'node_timeout' || String(rule.field || '').startsWith('node.');
    let current = getPath(snapshot, rule.field);
    if (isNodeRule) current = rule.value;
    const firingNow = rule.enabled && !isNodeRule && current != null && fired(rule, current);
    return { ...rule, current: current == null ? null : Math.round(current * 100) / 100, firing: firingNow };
  });
  const firing = all.filter((r) => r.firing);
  return { firing, all };
}

// 结算告警：命中 upsert，回落 resolve，保证「触发一次只推一次、回落自动结案」
async function applyAlertDelta(rules, snapshot) {
  const { firing, all } = await evaluate(rules, snapshot);
  const now = new Date();
  for (const r of firing) {
    await upsertAlert({
      type: 'blocked', level: r.level, title: r.title,
      message: r.message.replace(/\{\{current\}\}/g, String(r.current)).replace(/\{\{value\}\}/g, String(r.value)).replace(/\{\{unit\}\}/g, String(r.unit || '')),
      dueAt: now, dedupKey: `mon:${r.key}`, orderId: null,
    });
  }
  // 回落结案：此前 firing 的规则若当前不再命中，则 resolve 对应 active 预警
  const previouslyKeys = new Set(all.filter((r) => !r.firing && r.enabled).map((r) => `mon:${r.key}`));
  if (previouslyKeys.size) {
    try {
      await AlertRecord.update({ status: 'resolved', resolvedAt: now }, {
        where: { dedupKey: { [Op.in]: [...previouslyKeys] }, status: 'active' },
      });
    } catch (e) { logger.warn('[MONITOR] 结案失败', { message: e.message }); }
  }
  return { firing, all };
}

// ── 流程节点超时自动升级 ──
// 对 in_progress 订单：首个未完成的启用流程节点若停滞超过阈值小时，升 AlertRecord 并标记节点 blocked。
function bizFlowType(orderType) {
  if (orderType === 'import') return 'import';
  return 'export'; // export / transit 复用出口流程
}

async function escalateStuckNodes(rules) {
  const nodeRule = rules.find((r) => r.key === 'node_timeout');
  const enabled = nodeRule ? nodeRule.enabled : true;
  const timeoutHours = nodeRule && Number.isFinite(nodeRule.value) && nodeRule.value > 0 ? nodeRule.value : 48;
  const now = new Date();
  try {
    const orders = await Order.findAll({
      where: { status: 'in_progress' },
      attributes: ['id', 'orderNo', 'type', 'createdAt', 'groupId', 'ownerId'],
    });
    if (!orders.length) return { escalated: 0, resolved: 0 };

    const ids = orders.map((o) => o.id);
    const [instances, templates, alerts] = await Promise.all([
      OrderNode.findAll({ where: { orderId: { [Op.in]: ids } } }),
      FlowNode.findAll({ where: { enabled: true }, order: [['bizType', 'ASC'], ['sort', 'ASC'], ['id', 'ASC']] }),
      AlertRecord.findAll({ where: { dedupKey: { [Op.like]: 'node:%' } } }),
    ]);
    const instByOrder = new Map();
    for (const i of instances) {
      if (!instByOrder.has(i.orderId)) instByOrder.set(i.orderId, []);
      instByOrder.get(i.orderId).push(i);
    }
    const alertsByKey = new Map(alerts.map((a) => [a.dedupKey, a]));

    let escalated = 0;
    let resolved = 0;
    for (const order of orders) {
      const flowType = bizFlowType(order.type);
      const template = templates.filter((t) => t.bizType === flowType);
      if (!template.length) continue;
      const inst = instByOrder.get(order.id) || [];
      const doneCodes = new Set(inst.filter((n) => n.status === 'done' || n.status === 'blocked').map((n) => n.nodeCode));
      // 首个未完成节点
      const current = template.find((n) => !doneCodes.has(n.nodeCode));
      if (!current) continue; // 全部完成
      const nodeInst = inst.find((n) => n.nodeCode === current.nodeCode);
      const key = `node:${order.id}:${current.nodeCode}`;
      const existingAlert = alertsByKey.get(key);

      // 停滞时长：自上一个完成节点 / 订单创建以来
      const doneTimes = inst.filter((n) => n.doneAt).map((n) => new Date(n.doneAt).getTime());
      const lastProgress = doneTimes.length ? Math.max(...doneTimes) : (order.createdAt ? new Date(order.createdAt).getTime() : now.getTime());
      const stuckHours = (now.getTime() - lastProgress) / 3600000;

      if (stuckHours >= timeoutHours) {
        const day = Math.floor(stuckHours) + '小时';
        await upsertAlert({
          type: 'blocked', level: nodeRule ? nodeRule.level : 'warning',
          title: `流程节点停滞：${current.nodeName}`,
          message: `订单 ${order.orderNo} 的「${current.nodeName}」节点已停滞约 ${day}（超过 ${timeoutHours}h），已自动升级提醒操作员跟进。`,
          orderId: order.id, dueAt: now, dedupKey: key,
        });
        if (nodeInst && nodeInst.status === 'pending') await nodeInst.update({ status: 'blocked' });
        escalated += 1;
      } else if (existingAlert && existingAlert.status === 'active') {
        // 若节点已恢复（如已完成后仍残留 active），结案
        const nowDone = inst.some((n) => n.nodeCode === current.nodeCode && n.status === 'done');
        if (nowDone) { await existingAlert.update({ status: 'resolved', resolvedAt: now }); resolved += 1; }
      }
    }
    return { escalated, resolved };
  } catch (e) {
    logger.error('[MONITOR] 节点升级扫描失败', { message: e.message });
    return { escalated: 0, resolved: 0, error: e.message };
  }
}

// ── 周期任务（每 60s 评估告警 + 每 10 分钟节点升级，避免过于频繁）──
let monitorTimer = null;
function startMonitoring() {
  if (monitorTimer) return;
  monitorTimer = cron.schedule('*/1 * * * *', () => {
    (async () => {
      try {
        const rules = await loadRules();
        const snapshot = await buildSnapshot();
        await applyAlertDelta(rules, snapshot);
        // 流程节点升级扫描较重，压到每 10 分钟一次
        if (new Date().getMinutes() % 10 === 0) {
          await escalateStuckNodes(rules);
        }
      } catch (e) { logger.error('[MONITOR] 指标评估失败', { message: e.message }); }
    })();
  });
  logger.info('[MONITOR] 周期监控任务已启动（60s 评估告警，节点升级每 10min）');
  return monitorTimer;
}

function stopMonitoring() {
  if (monitorTimer) { try { monitorTimer.stop(); } catch { /* 已停止 */ } monitorTimer = null; }
  logger.info('[MONITOR] 周期监控任务已停止');
}

module.exports = {
  loadRules, saveRules, buildSnapshot, evaluate, applyAlertDelta, escalateStuckNodes,
  startMonitoring, stopMonitoring, DEFAULT_RULES,
};