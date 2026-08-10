'use strict';

// 监控与告警指标服务（F8 可观测性）
// 基于 prom-client 暴露 Prometheus 文本格式指标，供 /api/metrics 抓取。
// 设计：
//   - HTTP RED 指标：请求数(按 method/route/status)、耗时直方图、慢请求数
//   - 业务埋点：事件总线各事件计数（order/alert/finance/approval/system）
//   - 资源指标：进程内存/堆、事件循环延迟、DB 连接池、缓存命中
//   - 零阻塞：指标采集/登记失败绝不抛异常（prom-client 内部已容错）
// 端点：GET /api/metrics（Prometheus 文本，供 Grafana 数据源抓取）

const client = require('prom-client');
const { logger } = require('../utils/logger');

// 默认注册表收集 Node 默认指标（内存、libuv、堆等）
client.collectDefaultMetrics({ prefix: 'node_', gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5] });

// ── HTTP RED 指标 ──
const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP 请求总数（按 method/route/status）',
  labelNames: ['method', 'route', 'status'],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 请求耗时（秒）',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const slowRequests = new client.Counter({
  name: 'http_slow_requests_total',
  help: '超过慢查询阈值的请求数',
  labelNames: ['method', 'route'],
});

// ── 业务事件埋点 ──
const businessEvents = new client.Counter({
  name: 'business_events_total',
  help: '业务事件总线事件计数（按事件名）',
  labelNames: ['event'],
});

// ── 缓存指标 ──
const cacheHits = new client.Counter({ name: 'cache_hits_total', help: '缓存命中次数' });
const cacheMisses = new client.Counter({ name: 'cache_misses_total', help: '缓存未命中次数' });
const cacheWrites = new client.Counter({ name: 'cache_writes_total', help: '缓存写入次数' });
const cacheFallbacks = new client.Counter({ name: 'cache_fallback_total', help: '缓存降级（Redis->内存/源）次数' });

// ── DB 连接池 / 事件循环延迟 ──
const dbPoolGauge = new client.Gauge({
  name: 'db_connection_pool',
  help: '数据库连接池状态（used/idle/available）',
  labelNames: ['state'],
});
const eventLoopLag = new client.Gauge({
  name: 'event_loop_lag_ms',
  help: '事件循环实时延迟（毫秒）',
});

// 记录一次 HTTP 请求的 RED 指标
function recordHttp({ method, route, status, durationMs }) {
  try {
    httpRequests.inc({ method, route, status }, 1);
    httpDuration.observe({ method, route }, durationMs / 1000);
  } catch (e) { /* 指标容错 */ }
}

// 记录一次慢请求
function recordSlow({ method, route }) {
  try { slowRequests.inc({ method, route }, 1); } catch (e) { /* 容错 */ }
}

// 业务事件计数（由 eventBus 订阅调用）
function recordEvent(eventName) {
  try { businessEvents.inc({ event: eventName || 'unknown' }, 1); } catch (e) { /* 容错 */ }
}

// 同步缓存指标（从 cacheService 读取增量）
let lastCacheStats = { hits: 0, misses: 0, writes: 0, fallbacks: 0 };
function sampleCache(cacheService) {
  try {
    const s = cacheService.getStats();
    cacheHits.inc(s.hits - lastCacheStats.hits);
    cacheMisses.inc(s.misses - lastCacheStats.misses);
    cacheWrites.inc(s.writes - lastCacheStats.writes);
    cacheFallbacks.inc(s.fallbacks - lastCacheStats.fallbacks);
    lastCacheStats = { hits: s.hits, misses: s.misses, writes: s.writes, fallbacks: s.fallbacks };
  } catch (e) { /* 容错 */ }
}

// 采样 DB 连接池（sequelize 实例）
function sampleDbPool(sequelize) {
  try {
    const pool = sequelize?.connectionManager?.pool;
    if (!pool) return;
    // pg Pool 的统计入口（不同 pg 版本属性名/初始化时机有差异，全部安全兜底，避免 NaN 污染指标）
    const total = Number.isFinite(pool.totalCount) ? pool.totalCount : 0;
    const idle = Number.isFinite(pool.idleCount) ? pool.idleCount : 0;
    const available = Number.isFinite(pool.availableCount) ? pool.availableCount : Math.max(total - idle, 0);
    const used = Math.max(total - idle, 0);
    dbPoolGauge.set({ state: 'used' }, used);
    dbPoolGauge.set({ state: 'idle' }, idle);
    dbPoolGauge.set({ state: 'available' }, available);
  } catch (e) { /* 容错 */ }
}

// 采样事件循环延迟
function sampleEventLoop() {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    try { eventLoopLag.set(elapsed); } catch (e) { /* 容错 */ }
  });
}

// 周期采样（每 10s）：仅在同一进程内调用一次，避免重复采样
let samplerTimer = null;
function startSampler(sequelize, cacheService) {
  if (samplerTimer) return;
  sampleDbPool(sequelize);
  sampleEventLoop();
  samplerTimer = setInterval(() => {
    try {
      sampleDbPool(sequelize);
      sampleCache(cacheService);
      sampleEventLoop();
    } catch (e) { /* 容错 */ }
  }, 10000);
  samplerTimer.unref?.();
}

function stopSampler() {
  if (samplerTimer) { clearInterval(samplerTimer); samplerTimer = null; }
}

// 生成 Prometheus 文本格式
async function registry() {
  return client.register.metrics();
}

// Prometheus 文本内容类型（供 /api/metrics 响应头）
const contentType = client.register.contentType;

module.exports = {
  recordHttp, recordSlow, recordEvent, sampleCache, sampleDbPool, startSampler, stopSampler, registry, contentType,
};