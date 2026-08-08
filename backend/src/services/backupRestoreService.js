// 备份 / 恢复 HTTP 服务（AC-22）
// 复用 scripts/backup.js（createBackup）与 scripts/lib/tar.js（extractGzip）：
//   - createApiBackup(): 执行备份，返回 { filename, size, file(abs), warnings }
//   - restoreApiArchive(): 预检(dry-run) → 快照 → 替换（与 scripts/restore.js 流程一致，仅跳过交互确认）
// 安全：仅 admin 端点调用（路由层 guard）；restore 不覆盖当前 .env（与 CLI 默认一致，防止密钥被替换）；
//       restore 前自动生成 freight-prerestore-*.tar.gz 快照，出错可退回。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBackup } = require('../../scripts/backup');
const { extractGzip } = require('../../scripts/lib/tar');
const { logger } = require('../utils/logger');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_PREFIX = 'freight-prerestore';

function backupDir() {
  return path.resolve(process.env.BACKUP_DIR || path.join(BACKEND_ROOT, 'backups'));
}

function countTree(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) n += countTree(path.join(dir, item.name));
    else n += 1;
  }
  return n;
}

// 清空目录：逐项删除，返回被占用/排除未能删除的路径（运行中后端会锁住自身 SQLite 库文件）
function emptyDir(dir, exclude = []) {
  const skipped = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const item of fs.readdirSync(dir)) {
    if (exclude.includes(item)) {
      skipped.push(item);
      continue;
    }
    try {
      fs.rmSync(path.join(dir, item), { recursive: true, force: true });
    } catch (e) {
      skipped.push(item);
    }
  }
  return skipped;
}

function copyTree(src, dest, exclude = []) {
  const skipped = [];
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(item.name)) {
      skipped.push(item.name);
      continue;
    }
    const from = path.join(src, item.name);
    const to = path.join(dest, item.name);
    if (item.isDirectory()) skipped.push(...copyTree(from, to, exclude).map((f) => path.join(item.name, f)));
    else if (item.isFile()) {
      try {
        fs.copyFileSync(from, to);
      } catch (e) {
        skipped.push(item.name);
      }
    }
  }
  return skipped;
}

// 执行一次备份，返回给前端展示的元数据
async function createApiBackup() {
  const r = await createBackup({ outDir: backupDir(), keep: 7 });
  return {
    filename: path.basename(r.file),
    size: r.size,
    file: r.file,
    warnings: r.warnings || [],
  };
}

/**
 * 恢复归档（与 scripts/restore.js 流程一致，跳过交互确认）。
 * @param {string} archivePath 上传的 tar.gz 绝对路径
 * @param {object} [opts] { dryRun: boolean }
 * @returns {Promise<{ok:boolean, dryRun?:boolean, message:string, details?:object, snapshotFile?:string}>}
 */
// 恢复归档（与 scripts/restore.js 流程一致，跳过交互确认）
// 运行中后端会锁住自身 SQLite 库文件：data/ 替换时显式排除当前库文件，避免删/写打开文件
// （Windows 会 EBUSY；Linux 虽可删但会丢失对新 inode 的写入），并在响应中提示用 CLI 恢复数据库。
const config = require('../config');

function liveDbFilename() {
  if (!config || config.db.dialect !== 'sqlite' || !config.db.storage) return null;
  return path.basename(String(config.db.storage).replace(/\\/g, '/'));
}

async function restoreApiArchive(archivePath, opts = {}) {
  const dryRun = !!opts.dryRun;
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-restore-api-'));
  try {
    // --- 1. 预检：解到临时目录，确认归档完整 + manifest 合法 ---
    const entries = await extractGzip(archivePath, stage);
    const manifestPath = path.join(stage, 'manifest.json');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { /* 非法 JSON */ }
    }
    if (!manifest || manifest.app !== 'freight-system') {
      return { ok: false, message: '归档缺少合法的 manifest.json（不属于本系统），拒绝恢复' };
    }

    const stageData = path.join(stage, 'data');
    const stageUploads = path.join(stage, 'uploads');
    const liveDb = liveDbFilename();
    const details = {
      hostname: manifest.hostname,
      createdAt: manifest.createdAt,
      dbDialect: manifest.dbDialect,
      fileCount: entries.filter((e) => e.type === 'file').length,
      dataFiles: countTree(stageData),
      uploadFiles: countTree(stageUploads),
      hasEnv: fs.existsSync(path.join(stage, 'config', '.env')),
    };

    if (dryRun) {
      return { ok: true, dryRun: true, message: '预检通过（dry-run，未修改任何数据）', details };
    }

    // --- 2. 快照当前状态（恢复失败可退回） ---
    const snapshot = await createBackup({ outDir: backupDir(), keep: 5, prefix: SNAPSHOT_PREFIX });

    // --- 3. 替换 data/ 与 uploads/（不覆盖 .env，防止密钥被替换） ---
    const targetData = path.join(BACKEND_ROOT, 'data');
    const targetUploads = path.join(BACKEND_ROOT, 'uploads');
    const skipped = [];
    if (fs.existsSync(stageData)) {
      // 运行中的 SQLite 库文件不参与删除/替换
      skipped.push(...emptyDir(targetData, liveDb ? [liveDb] : []).map((f) => `data/${f}`));
      skipped.push(...copyTree(stageData, targetData, liveDb ? [liveDb] : []).map((f) => `data/${f}`));
    }
    if (fs.existsSync(stageUploads)) {
      emptyDir(targetUploads);
      copyTree(stageUploads, targetUploads);
    }
    if (liveDb) skipped.push(`data/${liveDb}（运行中的数据库文件，已保留）`);

    logger.info(`[RESTORE] 恢复完成：来源 ${details.hostname}，快照 ${path.basename(snapshot.file)}${skipped.length ? `，${skipped.length} 个文件未替换` : ''}`);
    const message = liveDb
      ? `恢复完成，但数据库文件（${liveDb}）正在运行未替换；如需恢复数据库请停止后端后使用 CLI：node scripts/restore.js <备份> --yes`
      : '恢复完成，请重启后端服务使数据生效';
    return {
      ok: true,
      dryRun: false,
      message,
      details: { ...details, snapshotFile: path.basename(snapshot.file), snapshotSize: snapshot.size, skipped },
    };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// 供下载用：校验文件名防路径穿越，返回备份文件绝对路径或 null
function resolveBackupFile(filename) {
  const base = path.basename(String(filename || ''));
  // 只允许 backup / prerestore 产出的 tar.gz
  if (!/^freight-(backup|prerestore)-\d{8}-\d{6}\.tar\.gz$/.test(base)) return null;
  const abs = path.join(backupDir(), base);
  return fs.existsSync(abs) ? abs : null;
}

module.exports = { createApiBackup, restoreApiArchive, resolveBackupFile, backupDir };
