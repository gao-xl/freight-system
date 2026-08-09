// 定时任务失败告警小工具：连续失败达到阈值 → 通过通知服务推送
// 供 alertScheduler / trackingAutoPull 等定时任务共用，避免各自重复实现。
// 零副作用：无配置的通知渠道静默跳过（notificationService 的 push 本身 fail-open）。
const { logger } = require('../utils/logger');

const FAIL_ALERT_THRESHOLD = parseInt(process.env.JOB_FAIL_ALERT_THRESHOLD) || 3;
const failCounters = new Map();

async function notifyJobFailure(task, err) {
  try {
    const { push } = require('./notificationService');
    await push({
      eventType: 'job.failed',
      targetType: 'system',
      targetId: null,
      payload: {
        title: '定时任务连续失败',
        message: `任务 ${task} 连续失败 ${failCounters.get(task)} 次，请检查。最近错误：${String((err && err.message) || err).slice(0, 300)}`,
        task,
        severity: 'warning',
      },
    });
  } catch (e) {
    logger.error('[JOB-ALERT] 任务失败告警推送失败', { message: e.message });
  }
}

// 记录一次执行结果：失败递增计数并在达到阈值时推送；成功清零
async function trackJobResult(task, err) {
  if (err) {
    const n = (failCounters.get(task) || 0) + 1;
    failCounters.set(task, n);
    if (n === FAIL_ALERT_THRESHOLD) {
      await notifyJobFailure(task, err);
    }
    return n;
  }
  failCounters.set(task, 0);
  return 0;
}

module.exports = { trackJobResult, FAIL_ALERT_THRESHOLD };