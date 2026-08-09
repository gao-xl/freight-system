const cron = require('node-cron');
const { Op } = require('sequelize');
const { AuditLog } = require('../models');
const config = require('../config');
const { logger } = require('../utils/logger');

// 数据保留策略：每日清理过期的审计日志，防止 AuditLogs 无限增长。
// 默认关闭（AUDIT_RETENTION_DAYS=0），避免无意删除审计记录；显式设置天数后启用。
// 属于可逆性差的破坏性清理，故逾期天数、每日执行时间均在配置/注释中明确，便于复核。

const jobs = [];

function stopDataRetention() {
  for (const j of jobs) {
    try { j.stop(); } catch { /* 忽略已停止/无效任务 */ }
  }
  jobs.length = 0;
  logger.info('[RETENTION] 数据保留清理任务已停止');
}

// 清理 createdAt 早于 cutoff 的审计日志；返回删除行数
async function runAuditRetention() {
  const days = config.auditRetentionDays;
  if (!days || days <= 0) {
    logger.info('[RETENTION] 审计日志保留未启用（AUDIT_RETENTION_DAYS=0，跳过）');
    return 0;
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const deleted = await AuditLog.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    logger.info('[RETENTION] 审计日志清理完成', { olderThanDays: days, deleted });
    return deleted;
  } catch (e) {
    logger.error('[RETENTION] 审计日志清理失败', { message: e.message });
    return 0;
  }
}

function startDataRetention() {
  // 每天凌晨 03:17 执行一次（避开业务高峰；纯内部任务，无并发写冲突）
  const job = cron.schedule('17 3 * * *', () => { runAuditRetention(); });
  jobs.push(job);
  const mode = config.auditRetentionDays > 0
    ? `启用：每日清理超过 ${config.auditRetentionDays} 天的审计日志`
    : '未启用（AUDIT_RETENTION_DAYS=0）';
  logger.info(`[RETENTION] 数据保留清理已注册（${mode}）`);
  return job;
}

module.exports = { startDataRetention, stopDataRetention, runAuditRetention };