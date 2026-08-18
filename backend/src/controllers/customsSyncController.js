const { ok, fail, asyncHandler } = require('../utils/response');
const customsSync = require('../services/customsSyncService');

// P2-2 报关单申报/查询控制器：将系统内报关单推送单一窗口并查询状态

// POST /customs-declarations/:id/submit 推送报关申报
const submit = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await customsSync.submitDeclaration(id);
    return ok(res, { synced: result.synced, requestId: result.requestId, attempt: result.attempt }, '报关单已推送');
  } catch (e) {
    return fail(res, e.message, 1, e.statusCode || 502);
  }
});

// GET /customs-declarations/:id/sync-status 查询报关状态
const query = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await customsSync.queryDeclaration(id);
    return ok(res, { data: result.data, requestId: result.requestId, attempt: result.attempt }, '状态已同步');
  } catch (e) {
    return fail(res, e.message, 1, e.statusCode || 502);
  }
});

module.exports = { submit, query };