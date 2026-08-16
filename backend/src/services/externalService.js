// 免费第三方外部API统一服务层
// 提供缓存策略 + 适配器调用 + 汇率落库，避免免费额度耗尽。
const { Op } = require('sequelize');
const { ExchangeRate } = require('../models');
const { IntegrationClient } = require('../integrations');
const { logger } = require('../utils/logger');
// F7 统一缓存服务：内存默认 / Redis（REDIS_URL）可选，fail-open 降级
const cache = require('./cacheService');

// 统一缓存封装：ttlMs 毫秒 → 内部秒；多实例共享缓存由 cacheService 决定
async function withCache(key, ttlMs, fn) {
  const hit = await cache.get(key);
  if (hit !== null && hit !== undefined) return hit;
  const data = await fn();
  await cache.set(key, data, Math.ceil(ttlMs / 1000));
  return data;
}

// 内置兜底汇率（外部汇率对接未启用时使用，近似值仅作展示/换算兜底）
const FALLBACK_RATES = {
  USD: { CNY: 7.2, EUR: 0.92, HKD: 7.8, JPY: 150 },
  CNY: { USD: 0.139, EUR: 0.128, HKD: 1.083, JPY: 20.83 },
  EUR: { USD: 1.087, CNY: 7.83, HKD: 8.48, JPY: 163 },
  HKD: { USD: 0.128, CNY: 0.923, EUR: 0.118, JPY: 19.2 },
  JPY: { USD: 0.00667, CNY: 0.048, EUR: 0.00613, HKD: 0.052 },
};

// 会计期间工具：period 为 YYYY-MM（缺省取当月）；monthRange 返回 [当月首日, 次月首日) 的日期区间
function periodOf(period) {
  if (!period) return new Date().toISOString().slice(0, 7);
  return String(period).slice(0, 7);
}
function monthRange(period) {
  const p = periodOf(period);
  const start = new Date(`${p}-01T00:00:00Z`);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { start: start.toISOString().slice(0, 10), next: next.toISOString().slice(0, 10) };
}

// 汇率：月固定汇率——取指定会计期间（默认当月）的固定汇率
// 规则：当期 → 最近上期 → 内置兜底；只读不落库（落库由 refresh / 手动维护负责）
async function getRate(base = 'USD', target = 'CNY', period) {
  const { start, next } = monthRange(period);
  const hit = await ExchangeRate.findOne({
    where: {
      baseCurrency: base, targetCurrency: target,
      rateDate: { [Op.gte]: start, [Op.lt]: next },
    },
    order: [['rateDate', 'DESC']],
  });
  if (hit) return Number(hit.rate);

  const prev = await ExchangeRate.findOne({
    where: {
      baseCurrency: base, targetCurrency: target,
      rateDate: { [Op.lt]: start },
    },
    order: [['rateDate', 'DESC']],
  });
  if (prev) return Number(prev.rate);

  return FALLBACK_RATES[base]?.[target] ?? null;
}

// 批量刷新汇率（定时任务 / 手动触发）——月固定汇率：写入指定会计期间（默认当月）首日
// opts.overwrite=false（定时任务）：当期已有汇率则跳过，保持月内固定；true（手动）：覆盖当期
async function refreshExchangeRates(targets, base, period, opts = {}) {
  const list = (targets || process.env.FX_TARGETS || 'CNY,EUR,JPY,HKD,GBP')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const based = (base || process.env.FX_BASE || 'USD').toUpperCase();
  const client = await IntegrationClient.get('exchange_rate');
  if (!client.cfg || !client.cfg.enabled) {
    logger.info('[EXTERNAL] 汇率对接未启用，跳过刷新');
    return 0;
  }
  const data = await client.query({ base: based });
  const { start, next } = monthRange(period);
  const rateDate = start;
  let n = 0;
  for (const t of list) {
    if (t === based) continue;
    const rate = data?.rates?.[t];
    if (!rate) continue;
    const monthRows = await ExchangeRate.findAll({
      where: {
        baseCurrency: based, targetCurrency: t,
        rateDate: { [Op.gte]: start, [Op.lt]: next },
      },
    });
    if (monthRows.length && !opts.overwrite) continue; // 月内固定：已有当期汇率则不覆盖
    if (monthRows.length) await ExchangeRate.destroy({ where: { id: monthRows.map((r) => r.id) } });
    await ExchangeRate.create({ baseCurrency: based, targetCurrency: t, rate, rateDate });
    n++;
  }
  return n;
}

// AIS 船舶位置（缓存 10 分钟）
async function vessel(mmsi) {
  const client = await IntegrationClient.get('ais_tracking');
  if (!client.cfg || !client.cfg.enabled) throw new Error('AIS 对接未启用');
  return withCache(`ais:${mmsi}`, 10 * 60 * 1000, () => client.query({ mmsi }));
}

// 船期查询（缓存 1 天）
async function schedule(payload) {
  const client = await IntegrationClient.get('ship_schedule');
  if (!client.cfg || !client.cfg.enabled) throw new Error('船期对接未启用');
  const key = `schedule:${JSON.stringify(payload)}`;
  return withCache(key, 24 * 3600 * 1000, () => client.query(payload));
}

// 汇率查询（含缓存落库；会计期间纳入缓存键，避免跨期命中旧汇率）
async function rate(payload) {
  const base = (payload?.base || 'USD').toUpperCase();
  const target = (payload?.target || 'CNY').toUpperCase();
  const period = payload?.period ? periodOf(payload.period) : '';
  return withCache(`rate:${base}:${target}:${period}`, 6 * 3600 * 1000, () => getRate(base, target, period));
}

// C4 运价查询
async function freightRate(payload) {
  const client = await IntegrationClient.get('freight_rate');
  if (!client.cfg || !client.cfg.enabled) {
    // 未启用时返回内置模拟运价
    return {
      ok: true,
      simulated: true,
      from: payload?.from, to: payload?.to, containerType: payload?.containerType,
      rates: [
        { carrier: 'COSCO', price: 1650, currency: 'USD', transitDays: 18 },
        { carrier: 'MAERSK', price: 1720, currency: 'USD', transitDays: 17 },
        { carrier: 'OOCL', price: 1580, currency: 'USD', transitDays: 20 },
      ],
    };
  }
  const key = `rate:${JSON.stringify(payload)}`;
  return withCache(key, 6 * 3600 * 1000, () => client.query(payload));
}

module.exports = { getRate, refreshExchangeRates, periodOf, monthRange, vessel, schedule, rate, freightRate };