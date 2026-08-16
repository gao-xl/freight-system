// 汇率管理控制器：查看/手动维护/触发刷新/金额换算
// 数据源 ExchangeRate 表（月固定汇率，rateDate 存当月首日）+ 外部适配器 + 内置兜底
const { Op } = require('sequelize');
const { ExchangeRate } = require('../services/dataAccess');
const { getRate, refreshExchangeRates, periodOf, monthRange } = require('../services/externalService');
const { ok, fail, asyncHandler } = require('../utils/response');
const { logger } = require('../utils/logger');

// 支持的目标币种（基准币种除外），可用 FX_TARGETS 覆盖
function targetCurrencies(base) {
  const list = (process.env.FX_TARGETS || 'CNY,EUR,HKD,JPY')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((c) => c !== base);
  return list.length ? list : ['CNY'];
}

// 内置兜底汇率（外部 API 未启用时使用，近似值仅作展示/换算兜底）
const FALLBACK_RATES = {
  USD: { CNY: 7.2, EUR: 0.92, HKD: 7.8, JPY: 150 },
  CNY: { USD: 0.139, EUR: 0.128, HKD: 1.083, JPY: 20.83 },
};

// 查询某会计期间汇率（月固定汇率）；当期缺失时回退最近上期，并标注来源
async function effectiveRates(base = 'USD', period) {
  const p = periodOf(period);
  const { start, next } = monthRange(p);
  const targets = targetCurrencies(base);
  const rows = await ExchangeRate.findAll({
    where: { baseCurrency: base, targetCurrency: { [Op.in]: targets } },
    order: [['rateDate', 'DESC']],
  });
  const list = targets.map((target) => {
    const rowsForTarget = rows.filter((r) => r.targetCurrency === target); // 已按 rateDate DESC
    const inMonth = rowsForTarget.find((r) => r.rateDate >= start && r.rateDate < next);
    const latest = rowsForTarget[0];
    const row = inMonth || latest;
    const fallback = FALLBACK_RATES[base]?.[target];
    return {
      id: row?.id || null,
      baseCurrency: base,
      targetCurrency: target,
      rate: row ? Number(row.rate) : (fallback ?? null),
      rateDate: row ? row.rateDate : null,
      period: row ? row.rateDate.slice(0, 7) : null,
      source: inMonth ? 'db' : (latest ? 'latest' : 'fallback'),
      isCurrent: !!inMonth,
      fallbackRate: fallback ?? null,
    };
  });
  return { baseCurrency: base, period: p, list };
}

// 查询汇率列表（GET /exchange-rates?base=USD&period=YYYY-MM，兼容 rateDate=YYYY-MM-DD）
const list = asyncHandler(async (req, res) => {
  const base = String(req.query.base || process.env.FX_BASE || 'USD').toUpperCase();
  const period = req.query.period || (req.query.rateDate ? periodOf(req.query.rateDate) : undefined);
  const data = await effectiveRates(base, period);
  ok(res, data);
});

// 手动修改汇率（PUT /exchange-rates/:id { rate }）
const update = asyncHandler(async (req, res) => {
  const rate = Number(req.body.rate);
  if (!Number.isFinite(rate) || rate <= 0) return fail(res, '汇率必须为正数', 1, 400);
  const row = await ExchangeRate.findByPk(req.params.id);
  if (!row) return fail(res, '汇率记录不存在', 1, 404);
  await row.update({ rate: Number(rate.toFixed(6)) });
  logger.info(`[EXCHANGE] 手动修改汇率 ${row.baseCurrency}/${row.targetCurrency} → ${rate}（${row.rateDate}）`);
  ok(res, row, '汇率已更新');
});

// 新增/覆盖某会计期间汇率（POST /exchange-rates { baseCurrency, targetCurrency, rate, period|rateDate }）
// 每币种每月一条：写入前清理同月旧行，保证月内固定
const upsert = asyncHandler(async (req, res) => {
  const base = String(req.body.baseCurrency || 'USD').toUpperCase().slice(0, 10);
  const target = String(req.body.targetCurrency || '').toUpperCase().slice(0, 10);
  const rate = Number(req.body.rate);
  const period = periodOf(req.body.period || req.body.rateDate);
  if (!target) return fail(res, '缺少目标币种', 1, 400);
  if (!Number.isFinite(rate) || rate <= 0) return fail(res, '汇率必须为正数', 1, 400);
  const { start, next } = monthRange(period);
  await ExchangeRate.destroy({
    where: { baseCurrency: base, targetCurrency: target, rateDate: { [Op.gte]: start, [Op.lt]: next } },
  });
  const row = await ExchangeRate.create({
    baseCurrency: base, targetCurrency: target, rate: Number(rate.toFixed(6)), rateDate: start,
  });
  ok(res, row, '汇率已保存');
});

// 手动触发自动刷新（POST /exchange-rates/refresh）——显式调整，覆盖当期
const refresh = asyncHandler(async (req, res) => {
  const n = await refreshExchangeRates(undefined, undefined, req.body?.period, { overwrite: true });
  ok(res, { updated: n }, n > 0 ? `已刷新 ${n} 条汇率` : '汇率对接未启用或无需刷新');
});

// 金额换算（POST /exchange-rates/convert { amount, from, to, period? }）
const convert = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const from = String(req.body.from || 'USD').toUpperCase();
  const to = String(req.body.to || 'CNY').toUpperCase();
  if (!Number.isFinite(amount)) return fail(res, '金额不合法', 1, 400);
  if (from === to) return ok(res, { from, to, amount: Number(amount.toFixed(2)), rate: 1 });
  const rate = await getRate(from, to, req.body?.period);
  if (rate == null) return fail(res, `暂无 ${from}→${to} 汇率，请先维护或启用汇率对接`, 1, 404);
  ok(res, { from, to, amount: Number(amount.toFixed(2)), rate: Number(rate), result: Number((amount * rate).toFixed(2)) });
});

module.exports = { list, update, upsert, refresh, convert };
