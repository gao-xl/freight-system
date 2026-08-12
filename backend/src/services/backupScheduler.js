// 备份调度服务：强制月度自动备份 + 超期提醒/补备 + 结果提醒
//
// 定位：为「低成本设备（开发板 / 小主机 / NAS）上 Docker 部署」而设计的内置守护。
// 这类设备没有专职运维、数据高度依赖本地备份，因此本服务默认强制开启（fail-closed），
// 只有显式设 BACKUP_AUTO=off 才能关闭（仅特殊场景，如外部 cron 已接管）。
//
// 职责：
//   1. 月度强制备份：按 BACKUP_CRON（默认每月 1 号 03:30）自动执行一次备份。
//   2. 超期检查：启动时 + 每日检查距上次备份的天数，超过 BACKUP_MAX_AGE_DAYS（默认 35 天）
//      则推送「超期未备份」提醒；强制模式下自动补做一次备份。
//   3. 结果提醒：每次自动备份成功 / 失败都通过 notificationService 外发
//      （email / 企微 / webhook，缺配置渠道自动跳过），并 emit 到 eventBus 供消息中心落库。
//
// 复用：备份逻辑复用 scripts/backup.js（createBackup），备份列表复用 backupRestoreService。
// 优雅停机：stopBackupScheduler() 停止所有 cron 并等待在途备份完成，防止连接池关闭后被调用。
const path = require('path');
const cron = require('node-cron');
const { createBackup, pgDumpAvailable, humanSize } = require('../../scripts/backup');
const { listServerBackups, backupDir } = require('./backupRestoreService');
const { push } = require('./notificationService');
const { emit } = require('./eventBus');
const { logger } = require('../utils/logger');
const config = require('../config');

const jobs = [];
let inflight = Promise.resolve();

function track(promise) {
  inflight = Promise.allSettled([inflight, promise]);
  return promise;
}

// 距最近一次备份的天数；从未备份返回 null
function lastBackupAgeDays() {
  const list = listServerBackups().filter((b) => b.kind === 'backup');
  if (!list.length) return null;
  return (Date.now() - new Date(list[0].mtime).getTime()) / 86400000;
}

// 执行一次备份并发出结果事件与推送；失败不抛致命错误（由调用方决定是否补备）
async function performBackup(reason) {
  const r = await createBackup({
    outDir: config.backup.dir || backupDir(),
    keep: config.backup.keep,
    noPg: !pgDumpAvailable(),
  });
  const meta = {
    reason,
    filename: path.basename(r.file),
    size: r.size,
    sizeText: humanSize(r.size),
    fileCount: r.entries,
    warnings: r.warnings || [],
    time: new Date().toISOString(),
  };
  emit('backup.completed', meta);
  await push({
    eventType: 'backup.completed',
    targetType: 'system',
    targetId: null,
    payload: { ...meta, message: `备份完成：${meta.filename}（${meta.sizeText}）` },
  });
  return meta;
}

// 超期检查：从未备份 / 距上次备份超阈值 → 推送提醒；forceBackup 时自动补备一次
async function checkBackupFreshness({ forceBackup }) {
  const ageDays = lastBackupAgeDays();
  const maxAge = config.backup.maxAgeDays;
  const reasoning = () => {
    if (ageDays === null) return '系统从未产生过备份';
    return `已 ${Math.floor(ageDays)} 天未备份（上限 ${maxAge} 天）`;
  };

  if (ageDays !== null && ageDays <= maxAge) return { ok: true, ageDays, skipped: true };

  const meta = {
    ageDays,
    maxAgeDays: maxAge,
    message: `【备份超期】${reasoning()}，请尽快备份`,
    time: new Date().toISOString(),
  };
  emit('backup.overdue', meta);
  await push({ eventType: 'backup.overdue', targetType: 'system', targetId: null, payload: meta });

  // 强制补备：默认开启（BACKUP_AUTO 未关）。补备失败会再走 backup.failed 提醒。
  if (forceBackup) {
    try {
      await performBackup('overdue');
      return { ok: true, ageDays, backedUp: true };
    } catch (e) {
      logger.error('[BACKUP] 超期补备失败', { message: e.message });
      return { ok: false, ageDays, error: e.message };
    }
  }
  return { ok: true, ageDays, backedUp: false };
}

function stopBackupScheduler() {
  for (const j of jobs) {
    try { j.stop(); } catch { /* 忽略 */ }
  }
  jobs.length = 0;
  return inflight;
}

function startBackupScheduler() {
  if (config.backup.auto === false) {
    logger.warn('[BACKUP] 自动备份已关闭（BACKUP_AUTO=off），系统未启用月度强制备份守护');
    return { jobs: 0 };
  }

  let running = false;
  const runGuarded = (label, fn) => {
    if (running) return;
    running = true;
    track((async () => {
      try {
        await fn();
      } catch (e) {
        logger.error(`[BACKUP] ${label}执行失败`, { message: e.message });
        emit('backup.failed', { label, message: e.message, time: new Date().toISOString() });
        await push({
          eventType: 'backup.failed',
          targetType: 'system',
          targetId: null,
          payload: { label, message: e.message, time: new Date().toISOString() },
        });
      } finally {
        running = false;
      }
    })());
  };

  // 1) 月度强制备份（默认每月 1 号 03:30）
  jobs.push(cron.schedule(config.backup.schedule, () => {
    runGuarded('monthly', async () => {
      const meta = await performBackup('monthly');
      logger.info(`[BACKUP] 月度自动备份完成：${meta.filename}（${meta.sizeText}）`);
    });
  }));

  // 2) 每日超期检查（默认每日 09:00；超期且强制则补备）
  jobs.push(cron.schedule(config.backup.freshnessCron, () => {
    runGuarded('freshness', async () => {
      const r = await checkBackupFreshness({ forceBackup: true });
      if (r.ageDays !== null && r.ageDays > config.backup.maxAgeDays) {
        logger.warn(`[BACKUP] 超期检查：${r.backedUp ? `已补备` : `未补备`}（age=${Math.floor(r.ageDays)}d）`);
      }
    });
  }));

  // 3) 启动即检查一次：从未备份或超期 → 推送提醒并补备，让「强制每月备份」立即可见
  runGuarded('startup', async () => {
    const r = await checkBackupFreshness({ forceBackup: true });
    if (r.ageDays === null) logger.info('[BACKUP] 启动检查：系统尚无备份，已按强制策略初始化');
    else if (r.ageDays > config.backup.maxAgeDays) logger.warn(`[BACKUP] 启动检查：距上次备份 ${Math.floor(r.ageDays)} 天，超期${r.backedUp ? '，已补备' : ''}`);
    else logger.info(`[BACKUP] 启动检查：距上次备份 ${Math.floor(r.ageDays)} 天，正常`);
  });

  logger.info(`[BACKUP] 备份守护已启动：月度计划 ${config.backup.schedule}，超期阈值 ${config.backup.maxAgeDays} 天，每日检查 ${config.backup.freshnessCron}，强制=${config.backup.auto}`);
  return { jobs: jobs.length };
}

module.exports = { startBackupScheduler, stopBackupScheduler, performBackup, checkBackupFreshness, lastBackupAgeDays };