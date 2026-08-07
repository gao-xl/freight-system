const { runAutomations } = require('../services/automationService');
const { ok, asyncHandler } = require('../utils/response');

// 手动触发自动化（admin）：立即执行全部自动化动作并返回执行摘要
const run = asyncHandler(async (req, res) => {
  const result = await runAutomations();
  ok(res, result, `自动化执行完成：推进 ${result.advanced} 单，生成应收 ${result.financeCreated} 笔`);
});

module.exports = { run };
