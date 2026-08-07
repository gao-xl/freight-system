// 免费第三方外部API控制器
// /external/vessel /external/schedule /external/rate
const { ok, fail, asyncHandler } = require('../utils/response');
const svc = require('../services/externalService');

// GET /external/vessel/:mmsi  查询船舶实时位置
const vessel = asyncHandler(async (req, res) => {
  const mmsi = req.params.mmsi;
  if (!mmsi) return fail(res, '缺少 mmsi');
  try {
    const data = await svc.vessel(mmsi);
    ok(res, data);
  } catch (e) {
    fail(res, `AIS 查询失败：${e.message}`, 1, 502);
  }
});

// GET /external/schedule  查询船期
const schedule = asyncHandler(async (req, res) => {
  try {
    const data = await svc.schedule(req.query || {});
    ok(res, data);
  } catch (e) {
    fail(res, `船期查询失败：${e.message}`, 1, 502);
  }
});

// GET /external/rate?base=USD&target=CNY  查询汇率（含缓存）
const rate = asyncHandler(async (req, res) => {
  try {
    const data = await svc.rate(req.query || {});
    ok(res, data);
  } catch (e) {
    fail(res, `汇率查询失败：${e.message}`, 1, 502);
  }
});

// GET /external/freight-rate?from=&to=&containerType=  查询运价
const freightRate = asyncHandler(async (req, res) => {
  try {
    const data = await svc.freightRate(req.query || {});
    ok(res, data);
  } catch (e) {
    fail(res, `运价查询失败：${e.message}`, 1, 502);
  }
});

module.exports = { vessel, schedule, rate, freightRate };