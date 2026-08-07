const { ok, fail, asyncHandler } = require('../utils/response');
const portService = require('../services/portService');

// 港口数据查询（船舶/集装箱状态）
const query = asyncHandler(async (req, res) => {
  const payload = req.query && Object.keys(req.query).length ? { ...req.query } : req.body || {};
  try {
    const data = await portService.queryPort(payload);
    ok(res, data);
  } catch (e) {
    fail(res, `港口查询失败：${e.message}`, 1, 502);
  }
});

// 上报事件（靠泊/装卸）
const report = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  try {
    const data = await portService.reportPort(payload);
    ok(res, data, '事件已上报');
  } catch (e) {
    fail(res, `上报失败：${e.message}`, 1, 502);
  }
});

// 支持港口列表
const ports = asyncHandler(async (req, res) => {
  ok(res, portService.SUPPORTED_PORTS);
});

module.exports = { query, report, ports };