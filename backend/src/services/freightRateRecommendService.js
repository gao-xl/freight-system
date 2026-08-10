'use strict';

// P2 运价智能推荐服务：结合「当前有效运价」与「历史成交报价（confirmed/converted）」
// 计算每家承运商相对历史基准的低估幅度，并给出当前行情方向与最优建议。
// 供内部端点 /freight-rates/recommend 与门户端点 /portal/rates?mode=recommend 复用。

const { Op } = require('sequelize');
const { FreightRate, Quotation } = require('./dataAccess');
// F7 运价推荐结果缓存：仅当无数据隔离条件（admin/all 全量）时启用，避免跨隔离域泄漏
const cache = require('./cacheService');

const CONTAINER_TYPES = ['20GP', '40GP', '40HQ'];

// 判断是否有数据隔离条件（有 scope 时不缓存，保证隔离正确性）
function hasScope(scopeWhere) {
  return !!(scopeWhere && Object.keys(scopeWhere).length);
}

// rateScopeWhere：可选，用于在 FreightRate 检索上叠加数据隔离等条件
// quoteScopeWhere：可选，用于在 Quotation 检索上叠加数据隔离等条件
// 将数据隔离条件并入目标 where：当两者都含 Op.and 时合并为同一 and 数组，避免覆盖
function mergeScope(target, scope) {
  if (!scope || Object.keys(scope).length === 0) return;
  if (!scope[Op.and]) { Object.assign(target, scope); return; }
  const targetAnd = target[Op.and] || [];
  target[Op.and] = [...(Array.isArray(targetAnd) ? targetAnd : [targetAnd]), ...(Array.isArray(scope[Op.and]) ? scope[Op.and] : [scope[Op.and]])];
}

async function recommend({ originPort, destPort, containerType }, rateScopeWhere, quoteScopeWhere) {
  if (!originPort || !destPort) return { error: '请提供起运港与目的港' };
  const ct = String(containerType || '').toUpperCase();
  if (ct && !CONTAINER_TYPES.includes(ct)) return { error: 'containerType 仅支持 20GP/40GP/40HQ' };

  // F7 缓存：仅无数据隔离条件时缓存（10 分钟），命中直接返回，降低高频查询数据库压力
  const cacheable = !hasScope(rateScopeWhere) && !hasScope(quoteScopeWhere);
  let cacheKey = null;
  if (cacheable) {
    cacheKey = `rate:recommend:${originPort}:${destPort}:${ct || 'ALL'}`;
    const cached = await cache.get(cacheKey);
    if (cached && cached !== null && cached !== undefined) return cached;
  }

  const result = await computeRecommend({ originPort, destPort, containerType: ct }, rateScopeWhere, quoteScopeWhere);
  if (!result.error && cacheKey) {
    await cache.set(cacheKey, result, 600);
  }
  return result;
}

async function computeRecommend({ originPort, destPort, containerType: ct }, rateScopeWhere, quoteScopeWhere) {
  const today = new Date();

  // 1) 当前有效运价
  const rateWhere = { originPort, destPort };
  if (ct) rateWhere.containerType = ct;
  rateWhere[Op.and] = [
    { [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] },
    { [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: today } }] },
  ];
  if (rateScopeWhere) mergeScope(rateWhere, rateScopeWhere);
  const rates = await FreightRate.findAll({
    where: rateWhere,
    order: [['carrier', 'ASC'], ['rate', 'ASC']],
    attributes: ['id', 'carrier', 'containerType', 'rate', 'currency', 'validFrom', 'validTo', 'route', 'remark'],
  });

  // 2) 历史成交报价（confirmed/converted，同航线）——历史成交价基准
  const quoteWhere = {
    originPort,
    destPort,
    status: { [Op.in]: ['confirmed', 'converted'] },
    totalAmount: { [Op.gt]: 0 },
  };
  if (quoteScopeWhere) mergeScope(quoteWhere, quoteScopeWhere);
  const quotes = await Quotation.findAll({
    where: quoteWhere,
    attributes: ['totalAmount', 'currency', 'createdAt'],
  });

  // 3) 历史统计（按航线整体，报价无 carrier 字段）
  const hist = { count: 0, sum: 0, min: null, max: null };
  for (const q of quotes) {
    const amt = Number(q.totalAmount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    hist.count += 1;
    hist.sum += amt;
    if (hist.min === null || amt < hist.min) hist.min = amt;
    if (hist.max === null || amt > hist.max) hist.max = amt;
  }
  const histAvg = hist.count ? hist.sum / hist.count : null;

  // 4) 当前按承运商+箱型分组取最优价
  const bestByKey = new Map();
  for (const r of rates) {
    const key = `${r.carrier}#${r.containerType}`;
    if (!bestByKey.has(key)) bestByKey.set(key, r.toJSON());
  }
  const carriers = [...bestByKey.values()];
  const currentAvg = carriers.length
    ? carriers.reduce((s, c) => s + Number(c.rate), 0) / carriers.length
    : null;

  // 5) 行情方向
  let trend = 'flat';
  if (currentAvg !== null && histAvg !== null) {
    const diff = (currentAvg - histAvg) / histAvg;
    trend = diff > 0.05 ? 'up' : (diff < -0.05 ? 'down' : 'flat');
  }

  // 6) 推荐候选：按当前价升序，标注相对历史基准的低估幅度
  const candidates = carriers
    .map((c) => {
      const rate = Number(c.rate);
      const savingPct = histAvg !== null ? ((histAvg - rate) / histAvg) * 100 : null;
      return {
        carrier: c.carrier,
        containerType: c.containerType,
        rate: c.rate,
        currency: c.currency,
        validFrom: c.validFrom,
        validTo: c.validTo,
        vsHistAvg: savingPct === null ? null : Math.round(savingPct * 10) / 10,
        recommended: false,
      };
    })
    .sort((a, b) => Number(a.rate) - Number(b.rate));
  if (candidates.length) candidates[0].recommended = true;

  return {
    originPort,
    destPort,
    containerType: ct || 'ALL',
    trend,
    trendLabel: trend === 'up'
      ? '当前行情相对历史成交偏高'
      : (trend === 'down' ? '当前行情相对历史成交偏低' : '当前行情与历史成交基本持平'),
    currentAvg: currentAvg === null ? null : Math.round(currentAvg * 100) / 100,
    histAvg: histAvg === null ? null : Math.round(histAvg * 100) / 100,
    histCount: hist.count,
    histMin: hist.min,
    histMax: hist.max,
    candidates,
  };
}

module.exports = { recommend };