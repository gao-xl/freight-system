// 汇率管理控制器：查看/手动维护/触发刷新/金额换算
// 数据源 ExchangeRate 表（getRate 自动落库）+ 外部适配器 + 内置兜底
const { Op } = require('sequelize');
const { ExchangeRate } = require('../services/dataAccess');
const { getRate, refreshExchangeRates } = require('../services/externalService');
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

// 查询某日汇率；当日缺失时回退最近一条，并标注来源
async function effectiveRates(base = 'USD', rateDate) {
  const date = rateDate || new Date().toISOString().slice(0, 10);
  const targets = targetCurrencies(base);
  const rows = await ExchangeRate.findAll({
    where: { baseCurrency: base, targetCurrency: { [Op.in]: targets } },
    order: [['rateDate', 'DESC']],
  });
  const byTarget = new Map();
  for (const r of rows) {
    if (!byTarget.has(r.targetCurrency)) byTarget.set(r.targetCurrency, r);
  }
  const list = targets.map((target) => {
    const row = byTarget.get(target);
    const today = row && row.rateDate === date ? row : null;
    const latest = today || row;
    const fallback = FALLBACK_RATES[base]?.[target];
    return {
      id: latest?.id || null,
      baseCurrency: base,
      targetCurrency: target,
      rate: latest ? Number(latest.rate) : (fallback ?? null),
      rateDate: latest ? latest.rateDate : null,
      source: today ? 'db' : (latest ? 'latest' : 'fallback'),
      isToday: !!today,
      fallbackRate: fallback ?? null,
    };
  });
  return { baseCurrency: base, rateDate: date, list };
}

// 查询汇率列表（GET /exchange-rates?base=USD&rateDate=YYYY-MM-DD）
const list = asyncHandler(async (req, res) => {
  const base = String(req.query.base || process.env.FX_BASE || 'USD').toUpperCase();
  const data = await effectiveRates(base, req.query.rateDate);
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

// 新增/覆盖某日汇率（POST /exchange-rates { baseCurrency, targetCurrency, rate, rateDate }）
// 用于外部 API 未启用时手动补录当日汇率
const upsert = asyncHandler(async (req, res) => {
  const base = String(req.body.baseCurrency || 'USD').toUpperCase().slice(0, 10);
  const target = String(req.body.targetCurrency || '').toUpperCase().slice(0, 10);
  const rate = Number(req.body.rate);
  const rateDate = req.body.rateDate || new Date().toISOString().slice(0, 10);
  if (!target) return fail(res, '缺少目标币种', 1, 400);
  if (!Number.isFinite(rate) || rate <= 0) return fail(res, '汇率必须为正数', 1, 400);
  const [row] = await ExchangeRate.upsert({
    baseCurrency: base, targetCurrency: target, rate: Number(rate.toFixed(6)), rateDate,
  });
  ok(res, row, '汇率已保存');
});

// 手动触发自动刷新（POST /exchange-rates/refresh）
const refresh = asyncHandler(async (req, res) => {
  const n = await refreshExchangeRates();
  ok(res, { updated: n }, n > 0 ? `已刷新 ${n} 条汇率` : '汇率对接未启用或无需刷新');
});

// 金额换算（POST /exchange-rates/convert { amount, from, to }）
const convert = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const from = String(req.body.from || 'USD').toUpperCase();
  const to = String(req.body.to || 'CNY').toUpperCase();
  if (!Number.isFinite(amount)) return fail(res, '金额不合法', 1, 400);
  if (from === to) return ok(res, { from, to, amount: Number(amount.toFixed(2)), rate: 1 });
  const rate = await getRate(from, to);
  if (rate == null) return fail(res, `暂无 ${from}→${to} 汇率，请先维护或启用汇率对接`, 1, 404);
  ok(res, { from, to, amount: Number(amount.toFixed(2)), rate: Number(rate), result: Number((amount * rate).toFixed(2)) });
});

module.exports = { list, update, upsert, refresh, convert };
