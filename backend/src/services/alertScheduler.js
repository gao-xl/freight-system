const cron = require('node-cron');
const { runAllRules } = require('./alertService');
const { runAutomations } = require('./automationService');
const { logger } = require('../utils/logger');

// 预警 + 自动化定时任务：每 30 分钟执行一次规则扫描与自动动作
// 启动即执行一次，便于开发环境立即看到结果
function startAlertScheduler() {
  let running = false;
  const job = cron.schedule('*/30 * * * *', async () => {
    if (running) return; // 防重入
    running = true;
    try {
      await runAllRules();
      await runAutomations();
    } finally {
      running = false;
    }
  });
  // 首次执行
  runAllRules().catch((e) => logger.error('[ALERT] 首次扫描失败', { message: e.message }));
  runAutomations().catch((e) => logger.error('[AUTOMATION] 首次执行失败', { message: e.message }));
  logger.info('[SCHEDULER] 预警+自动化任务已注册（每 30 分钟）');
  return job;
}

module.exports = { startAlertScheduler };
