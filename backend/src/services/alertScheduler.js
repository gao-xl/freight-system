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

// 在途任务追踪：优雅停机需等待正在执行的扫描/自动化完成，再关闭数据库连接池，
// 否则会出现「连接池已关闭后仍被调用」的竞态错误（ConnectionManager.getConnection was called after...）。
let inflight = Promise.resolve();

function track(promise) {
  inflight = Promise.allSettled([inflight, promise]);
  return promise;
}

function stopAlertScheduler() {
  for (const j of jobs) {
    try { j.stop(); } catch { /* 忽略已停止/无效任务 */ }
  }
  jobs.length = 0;
  logger.info('[SCHEDULER] 定时任务已停止');
  // 返回在途任务完成信号，供 shutdown 在关闭连接池前 await，防止停机竞态
  return inflight;
}

function startAlertScheduler() {
  let running = false;
  const job = cron.schedule('*/30 * * * *', () => {
    if (running) return; // 防重入
    running = true;
    track((async () => {
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
    })());
  });
  jobs.push(job);
  // 首次执行（同样纳入在途追踪，停机时等待其完成）
  track(runAllRules().catch((e) => logger.error('[ALERT] 首次扫描失败', { message: e.message })));
  track(runAutomations().catch((e) => logger.error('[AUTOMATION] 首次执行失败', { message: e.message })));
  // E1 外部跟踪自动拉取（船期 6h / AIS 2h / 场站 4h，复用本调度入口注册）
  jobs.push(...startTrackingAutoPull());
  logger.info('[SCHEDULER] 预警+自动化任务已注册（每 30 分钟）');
  return job;
}

module.exports = { startAlertScheduler, stopAlertScheduler };
