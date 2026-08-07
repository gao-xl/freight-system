const { getAlerts, resolveAlert, runAllRules } = require('../services/alertService');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');

// GET /alerts?status=active&level=warning&orderId=1
const list = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const { status, level, orderId } = req.query;
  const data = await getAlerts({ status, level, orderId, page, pageSize });
  ok(res, data);
});

// POST /alerts/run  手动触发一次规则扫描
const run = asyncHandler(async (req, res) => {
  await runAllRules();
  ok(res, null, '规则扫描完成');
});

// POST /alerts/:id/resolve  POST /alerts/:id/ignore
const handle = asyncHandler(async (req, res) => {
  const action = req.path.endsWith('/resolve') ? 'resolve' : 'ignore';
  const rec = await resolveAlert(req.params.id, action);
  if (!rec) return fail(res, '预警不存在', 1, 404);
  ok(res, rec, action === 'resolve' ? '已标记解决' : '已忽略');
});

module.exports = { list, run, handle };