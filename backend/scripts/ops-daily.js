// 运维脚本：每日备份 + 异地同步 + 结果通知
// ---------------------------------------------------------------
// 职责：
//   1. 复用 scripts/backup.js 的 createBackup 做一次完整备份（pg_dump 业务库 + 上传文件 + 脱敏配置）
//   2. 异地同步：把备份归档同步到异地目标（NAS 挂载目录 / rsync 远程主机 / 对象存储挂载点）
//   3. 结果通知：成功 / 失败 / 同步失败均通过 scripts/lib/notify.js 外发
//      （email / 企微 / webhook，缺配置自动跳过）
//
// 为什么独立于后端进程：宕机时后端可能已挂，备份与告警必须由宿主机 crontab 独立调度。
//
// 用法（在 backend 目录执行）：
//   node scripts/ops-daily.js                     立即执行一次（备份 + 异地同步 + 通知）
//   node scripts/ops-daily.js --no-sync           只备份，跳过异地同步
//   node scripts/ops-daily.js --dry-run           只打印将要执行的动作，不落盘/不发通知
//
// 环境变量：
//   OPS_BACKUP_KEEP     本地保留份数（默认 14）
//   OPS_SYNC_DIR        异地同步目标目录（本地挂载点，如 NAS/NFS/对象存储挂载目录）
//   OPS_SYNC_RSYNC      rsync 远程目标（如 user@backup-host:/backups/freight），与 OPS_SYNC_DIR 二选一
//   OPS_SYNC_KEEP       异地保留份数（默认 30；仅 rsync 模式生效）
//
// 推荐 crontab（每日 02:00）：
//   0 2 * * * cd /opt/freight/freight-system/backend && node scripts/ops-daily.js >> logs/ops-daily.log 2>&1
// ---------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createBackup, humanSize, parseArgs } = require('./backup');
const { notify } = require('./lib/notify');

const BACKEND_ROOT = path.resolve(__dirname, '..');

function syncViaDir(backupFile, syncDir) {
  fs.mkdirSync(syncDir, { recursive: true });
  const dest = path.join(syncDir, path.basename(backupFile));
  fs.copyFileSync(backupFile, dest);
  const srcSize = fs.statSync(backupFile).size;
  const dstSize = fs.statSync(dest).size;
  if (dstSize !== srcSize) throw new Error(`异地文件大小不一致（源 ${srcSize} / 目标 ${dstSize}）`);
  return dest;
}

function syncViaRsync(backupFile, target) {
  const r = spawnSync('rsync', ['-az', '--partial', backupFile, target], { stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(`rsync 失败(exit=${r.status})：${String(r.stderr || '').trim().slice(0, 300)}`);
  }
  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.flags.has('dry-run');
  const noSync = args.flags.has('no-sync');
  const started = Date.now();

  const syncDir = process.env.OPS_SYNC_DIR || '';
  const syncRsync = process.env.OPS_SYNC_RSYNC || '';
  const keep = Number(process.env.OPS_BACKUP_KEEP) || 14;

  // ---- 1. 本地备份 ----
  if (dryRun) {
    console.log('[DRY-RUN] 将执行：本地备份（keep=' + keep + '）');
  } else {
    const r = await createBackup({ outDir: process.env.BACKUP_DIR || path.join(BACKEND_ROOT, 'backups'), keep });
    const meta = {
      filename: path.basename(r.file),
      size: r.size,
      sizeText: humanSize(r.size),
      fileCount: r.entries,
      dbBackup: r.dbBackup ? `${r.dbBackup.dbName}@${r.dbBackup.host}` : '无',
      warnings: r.warnings || [],
      time: new Date().toISOString(),
    };
    console.log(`[备份完成] ${meta.filename}（${meta.sizeText}，${meta.fileCount} 文件，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s）`);

    // ---- 2. 异地同步 ----
    let syncResult = null;
    if (noSync) {
      console.log('[同步] 已跳过（--no-sync）');
    } else if (syncDir && syncRsync) {
      console.log('[同步] OPS_SYNC_DIR 与 OPS_SYNC_RSYNC 同时设置，仅使用 OPS_SYNC_DIR');
    }
    if (!noSync && syncDir) {
      try {
        const dest = syncViaDir(r.file, syncDir);
        syncResult = { target: dest, method: 'dir' };
        console.log(`[同步完成] → ${dest}`);
      } catch (e) {
        console.error(`[同步失败] ${e.message}`);
        await notify({
          eventType: 'ops.sync.failed',
          title: '备份异地同步失败',
          message: `本地备份 ${meta.filename} 已生成，但同步到 ${syncDir} 失败：${e.message}`,
          payload: { filename: meta.filename, target: syncDir, error: e.message, ...meta },
        });
      }
    } else if (!noSync && syncRsync) {
      try {
        const dest = syncViaRsync(r.file, syncRsync);
        syncResult = { target: dest, method: 'rsync' };
        console.log(`[同步完成] rsync → ${syncRsync}`);
      } catch (e) {
        console.error(`[同步失败] ${e.message}`);
        await notify({
          eventType: 'ops.sync.failed',
          title: '备份异地同步失败',
          message: `本地备份 ${meta.filename} 已生成，但 rsync 到 ${syncRsync} 失败：${e.message}`,
          payload: { filename: meta.filename, target: syncRsync, error: e.message, ...meta },
        });
      }
    } else if (!noSync) {
      console.log('[同步] 未配置异地目标（OPS_SYNC_DIR / OPS_SYNC_RSYNC），仅保留本地备份');
    }

    // ---- 3. 结果通知 ----
    const results = await notify({
      eventType: syncResult ? 'ops.backup.completed' : 'ops.backup.completed',
      title: syncResult ? '每日备份与异地同步完成' : '每日备份完成（未异地同步）',
      message: [
        `备份文件：${meta.filename}`,
        `大小：${meta.sizeText}（${meta.fileCount} 个文件）`,
        `数据库：${meta.dbBackup}`,
        syncResult ? `异地同步：${syncResult.method} → ${syncResult.target}` : '异地同步：未配置/未执行',
        meta.warnings.length ? `提示：${meta.warnings.join('；')}` : '',
      ].filter(Boolean).join('\n'),
      payload: { ...meta, sync: syncResult },
    });
    const sent = results.filter((x) => x.status === 'sent').length;
    const failed = results.filter((x) => x.status === 'failed');
    console.log(`[通知] 已发送 ${sent} 个渠道${failed.length ? `，失败 ${failed.length} 个（${failed.map((f) => `${f.channel}:${f.error}`).join('；')}）` : ''}`);
  }
}

main().catch((e) => {
  console.error('[每日备份失败]', e.message);
  // 备份本身失败也要告警（fail-closed：宁可多通知，不可静默丢失）
  notify({
    eventType: 'ops.backup.failed',
    title: '每日备份执行失败',
    message: `备份流程异常终止：${e.message}`,
    payload: { error: e.message, time: new Date().toISOString() },
  }).then(() => process.exit(1)).catch(() => process.exit(1));
});
