const cron = require('node-cron');
const { runAllRules } = require('./alertService');
const { runAutomations } = require('./automationService');
const { startTrackingAutoPull } = require('./trackingAutoPull');
const { trackJobResult } = require('./jobFailureAlert');
const { logger } = require('../utils/logger');

// 预警 + 自动化定时任务：每 30 分钟执行一次规则扫描与自动动作
// 启动即执行一次，便于开发环境立即看到结果

// 登记所有已注册的 cron 任务，供优雅停机时统一停止
const jobs = [];

function stopAlertScheduler() {
  for (const j of jobs) {
    try { j.stop(); } catch { /* 忽略已停止/无效任务 */ }
  }
  jobs.length = 0;
  logger.info('[SCHEDULER] 定时任务已停止');
}

function startAlertScheduler() {
  let running = false;
  const job = cron.schedule('*/30 * * * *', async () => {
    if (running) return; // 防重入
    running = true;
    try {
      await runAllRules();
      await runAutomations();
      await trackJobResult('scheduler:rules+automation', null);
    } catch (e) {
      logger.error('[SCHEDULER] 预警/自动化任务失败', { message: e.message });
      await trackJobResult('scheduler:rules+automation', e);
    } finally {
      running = false;
    }
  });
  jobs.push(job);
  // 首次执行
  runAllRules().catch((e) => logger.error('[ALERT] 首次扫描失败', { message: e.message }));
  runAutomations().catch((e) => logger.error('[AUTOMATION] 首次执行失败', { message: e.message }));
  // E1 外部跟踪自动拉取（船期 6h / AIS 2h / 场站 4h，复用本调度入口注册）
  jobs.push(...startTrackingAutoPull());
  logger.info('[SCHEDULER] 预警+自动化任务已注册（每 30 分钟）');
  return job;
}

module.exports = { startAlertScheduler, stopAlertScheduler };
