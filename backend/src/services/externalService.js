// 免费第三方外部API统一服务层
// 提供缓存策略 + 适配器调用 + 汇率落库，避免免费额度耗尽。
const { Op } = require('sequelize');
const { ExchangeRate } = require('../models');
const { IntegrationClient } = require('../integrations');
const { logger } = require('../utils/logger');

// 简单内存缓存（多实例需换 Redis）
const cache = new Map();
async function withCache(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await fn();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

// 汇率：优先读库（当日），否则调适配器并落库
async function getRate(base = 'USD', target = 'CNY') {
  const today = new Date().toISOString().slice(0, 10);
  const hit = await ExchangeRate.findOne({
    where: { baseCurrency: base, targetCurrency: target, rateDate: today },
  });
  if (hit) return Number(hit.rate);

  const client = await IntegrationClient.get('exchange_rate');
  if (!client.cfg || !client.cfg.enabled) {
    // 未启用时返回常见固定汇率兜底（USD/CNY）
    return base === 'USD' && target === 'CNY' ? 7.2 : null;
  }
  const data = await client.query({ base });
  const rate = data?.rates?.[target];
  if (rate) {
    await ExchangeRate.create({ baseCurrency: base, targetCurrency: target, rate, rateDate: today });
  }
  return rate != null ? Number(rate) : null;
}

// 批量刷新汇率（定时任务调用）
async function refreshExchangeRates(targets = ['CNY', 'EUR', 'JPY', 'HKD', 'GBP']) {
  const client = await IntegrationClient.get('exchange_rate');
  if (!client.cfg || !client.cfg.enabled) {
    logger.info('[EXTERNAL] 汇率对接未启用，跳过刷新');
    return 0;
  }
  const data = await client.query({ base: 'USD' });
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const t of targets) {
    const rate = data?.rates?.[t];
    if (rate) {
      await ExchangeRate.upsert({ baseCurrency: 'USD', targetCurrency: t, rate, rateDate: today });
      n++;
    }
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

// 汇率查询（含缓存落库）
async function rate(payload) {
  const base = (payload?.base || 'USD').toUpperCase();
  const target = (payload?.target || 'CNY').toUpperCase();
  return withCache(`rate:${base}:${target}`, 6 * 3600 * 1000, () => getRate(base, target));
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

module.exports = { getRate, refreshExchangeRates, vessel, schedule, rate, freightRate };