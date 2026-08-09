// 备份 / 恢复 HTTP 服务（AC-22）
// 复用 scripts/backup.js（createBackup）与 scripts/lib/tar.js（extractGzip/listGzip）：
//   - createApiBackup(): 执行备份，返回 { filename, size, file(abs), warnings }
//   - listServerBackups(): 列出服务器 backups/ 目录下的备份
//   - inspectBackup(): 预检归档内容（manifest + pg_dump 表清单，按业务模块聚类）
//   - restoreApiArchive(): 全量/部分恢复（数据库表 + data/uploads），恢复前自动快照
//   - deleteServerBackup(): 删除服务器上的备份文件
// 安全：仅 admin 端点调用（路由层 guard）；restore 不覆盖当前 .env（与 CLI 默认一致，防止密钥被替换）；
//       restore 前自动生成 freight-prerestore-*.tar.gz 快照，出错可退回。
//       部分恢复的表名经 backupModules 白名单校验，杜绝任意表名注入。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');
const { createBackup, pgDumpAvailable, humanSize } = require('../../scripts/backup');
const { runPgRestore, pgRestoreAvailable } = require('../../scripts/restore');
const { extractGzip } = require('../../scripts/lib/tar');
const { logger } = require('../utils/logger');
const { normalizeTables, groupTablesByModule, allowedTables } = require('./backupModules');
const config = require('../config');

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

// 非破坏性替换：仅把归档中的文件覆盖到目标目录，绝不删除归档之外的文件
function overlayFromStage(stageDir, targetDir) {
  const skipped = [];
  if (!fs.existsSync(stageDir)) return skipped;
  skipped.push(...copyTree(stageDir, targetDir).map((f) => `${path.basename(stageDir)}/${f}`));
  return skipped;
}

// 执行一次备份，返回给前端展示的元数据
async function createApiBackup() {
  const r = await createBackup({ outDir: backupDir(), keep: 7, noPg: !pgDumpAvailable() });
  return {
    filename: path.basename(r.file),
    size: r.size,
    file: r.file,
    warnings: r.warnings || [],
  };
}

// ---------------------------------------------------------------- 备份列表 / 删除

// 列出服务器备份目录下的备份（含内部快照）。仅文件名/大小/时间，不解析内容，保证轻量。
function listServerBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^freight-(backup|prerestore)-\d{8}-\d{6}\.tar\.gz$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return {
        filename: f,
        size: st.size,
        sizeText: humanSize(st.size),
        mtime: st.mtime.toISOString(),
        kind: f.startsWith('freight-prerestore') ? 'prerestore' : 'backup',
      };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

function deleteServerBackup(filename) {
  const base = path.basename(String(filename || ''));
  if (!/^freight-(backup|prerestore)-\d{8}-\d{6}\.tar\.gz$/.test(base)) {
    return { ok: false, message: '文件名不合法' };
  }
  const abs = path.join(backupDir(), base);
  if (!fs.existsSync(abs)) return { ok: false, message: '备份文件不存在' };
  fs.rmSync(abs, { force: true });
  logger.info(`[BACKUP] 删除备份文件 ${base}`);
  return { ok: true, filename: base };
}

// ---------------------------------------------------------------- 内容检查

// 解析 pg_restore --list 输出，提取 public schema 下的表名集合
function parsePgRestoreList(output) {
  const tables = new Set();
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/^\s*\d+;\s+\d+\s+\d+\s+(.+)$/);
    if (!m) continue;
    const tokens = m[1].trim().split(/\s+/);
    let type = tokens[0];
    let idx = 1;
    if (type === 'TABLE' && tokens[1] === 'DATA') {
      type = 'TABLE DATA';
      idx = 2;
    }
    if (type !== 'TABLE' && type !== 'TABLE DATA') continue;
    const schema = tokens[idx];
    if (schema !== 'public') continue;
    let rawName = tokens[idx + 1] || '';
    if (rawName.startsWith('"') && !rawName.endsWith('"')) {
      rawName = `${rawName} ${tokens[idx + 2] || ''}`;
    }
    tables.add(rawName.replace(/"/g, ''));
  }
  return [...tables];
}

// 用 pg_restore --list 枚举 pg_dump 内的表
function listDumpTables(dumpFile) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn('pg_restore', ['--list', dumpFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 pg_restore：${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`无法读取备份中的表清单（pg_restore --list exit=${code}）：${err.trim().slice(0, 300)}`));
        return;
      }
      resolve(parsePgRestoreList(out));
    });
  });
}

// 检查一个备份归档的内容：manifest + 文件分区 + 数据库表清单（按模块聚类）
// archivePath 必须是已存在的本地归档文件
async function inspectBackup(archivePath) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-inspect-'));
  try {
    let entries;
    try {
      entries = await extractGzip(archivePath, stage);
    } catch (e) {
      return { ok: false, message: '归档不是有效的 tar.gz，无法检查' };
    }
    const manifestPath = path.join(stage, 'manifest.json');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { /* 忽略 */ }
    }
    if (!manifest || manifest.app !== 'freight-system') {
      return { ok: false, message: '归档缺少合法的 manifest.json（不属于本系统）' };
    }

    const dumpPath = path.join(stage, 'pg', 'dump.pg_dump');
    const hasDbDump = fs.existsSync(dumpPath);
    let tableNames = [];
    let dbError = null;
    if (hasDbDump) {
      try {
        tableNames = await listDumpTables(dumpPath);
      } catch (e) {
        dbError = e.message;
      }
    }

    const known = allowedTables();
    const knownTables = tableNames.filter((t) => known.has(t));
    const unknownTables = tableNames.filter((t) => !known.has(t));

    return {
      ok: true,
      details: {
        hostname: manifest.hostname,
        createdAt: manifest.createdAt,
        dbDialect: manifest.dbDialect,
        fileCount: entries.filter((e) => e.type === 'file').length,
        dataFiles: countTree(path.join(stage, 'data')),
        uploadFiles: countTree(path.join(stage, 'uploads')),
        hasEnv: fs.existsSync(path.join(stage, 'config', '.env')),
        hasDbDump,
        dbBackupSize: manifest.dbBackup ? manifest.dbBackup.size : null,
        tables: {
          total: tableNames.length,
          known: knownTables.length,
          unknown: unknownTables,
          modules: groupTablesByModule(knownTables),
        },
        dbError,
      },
    };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 数据库部分/全量恢复

function dbClient() {
  const cfg = config.db;
  return new Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.name,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

// 清空指定表（白名单校验后的表名），RESTART IDENTITY 重置序列，CASCADE 处理外键依赖
async function truncateTables(tables) {
  const client = dbClient();
  await client.connect();
  try {
    const quoted = tables.map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}

// 用 pg_restore --data-only --table=... 还原指定表的数据（一次调用，pg_restore 按 TOC 依赖序）
function restoreTableData(dumpFile, tables) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const cfg = config.db;
    const args = [
      '--host', cfg.host,
      '--port', String(cfg.port),
      '--username', cfg.user,
      '--dbname', cfg.name,
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--data-only',
      ...tables.map((t) => '--table'),
      ...tables,
      dumpFile,
    ];
    if (cfg.ssl) args.push('--sslmode=require');
    const child = spawn('pg_restore', args, {
      env: { ...process.env, PGPASSWORD: cfg.password || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errOut = '';
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 pg_restore：${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`数据库表还原失败（exit=${code}）：${String(errOut).trim().slice(0, 500)}`));
        return;
      }
      resolve();
    });
  });
}

// ---------------------------------------------------------------- 归档恢复

// 恢复归档（HTTP 场景非破坏性覆盖文件 + 可选数据库还原）
// opts: { dryRun, scope: 'full'|'partial', tables: [], includeData, includeUploads, includeDb }
// 全量：还原数据库全部表（--clean 重建）+ data/uploads
// 部分：先清空勾选表再还原其数据（data-only），可选覆盖 data/uploads
async function restoreApiArchive(archivePath, opts = {}) {
  const dryRun = !!opts.dryRun;
  const scope = opts.scope === 'partial' ? 'partial' : 'full';
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-restore-api-'));
  try {
    // --- 1. 预检：解到临时目录，确认归档完整 + manifest 合法 ---
    let entries;
    try {
      entries = await extractGzip(archivePath, stage);
    } catch (e) {
      return { ok: false, message: '归档不是有效的 tar.gz，拒绝恢复' };
    }
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
    const dumpPath = path.join(stage, 'pg', 'dump.pg_dump');
    const hasDbDump = fs.existsSync(dumpPath);
    const needsDb = scope === 'full' || (scope === 'partial' && opts.tables && opts.tables.length);
    const includeFiles = opts.includeData !== false || opts.includeUploads !== false;

    const details = {
      hostname: manifest.hostname,
      createdAt: manifest.createdAt,
      dbDialect: manifest.dbDialect,
      fileCount: entries.filter((e) => e.type === 'file').length,
      dataFiles: countTree(stageData),
      uploadFiles: countTree(stageUploads),
      hasEnv: fs.existsSync(path.join(stage, 'config', '.env')),
      hasDbDump,
      scope,
    };

    // 部分恢复：校验表名白名单
    let tables = [];
    if (scope === 'partial' && opts.tables && opts.tables.length) {
      const { valid, invalid } = normalizeTables(opts.tables);
      if (!valid.length) return { ok: false, message: '未选择可恢复的数据表' };
      if (invalid.length) details.invalidTables = invalid;
      tables = valid;
      if (hasDbDump) details.partialTables = tables;
      if (!hasDbDump) {
        tables = [];
        details.noDumpForTables = true;
      }
    }

    if (dryRun) {
      return { ok: true, dryRun: true, message: '预检通过（dry-run，未修改任何数据）', details };
    }

    // --- 2. 快照当前状态（恢复失败可退回；pg_dump 不可用时退化为仅文件快照）---
    const snapshot = await createBackup({ outDir: backupDir(), keep: 5, prefix: SNAPSHOT_PREFIX, noPg: !pgDumpAvailable() });

    // --- 3. 数据库恢复 ---
    let dbResult = 'skip';
    const dbErrors = [];
    if (needsDb && hasDbDump) {
      if (!pgRestoreAvailable()) {
        return { ok: false, message: `归档含数据库数据，但未找到 pg_restore（PostgreSQL 客户端）。Docker 镜像已内置；本机请安装 postgresql-client。快照已生成：${path.basename(snapshot.file)}` };
      }
      try {
        if (scope === 'partial') {
          await truncateTables(tables);
          await restoreTableData(dumpPath, tables);
          dbResult = `已还原 ${tables.length} 张表的数据`;
          details.restoredTables = tables;
        } else {
          await runPgRestore(dumpPath);
          dbResult = `${config.db.name}@${config.db.host} 全量还原`;
        }
      } catch (e) {
        dbErrors.push(e.message);
      }
    } else if (needsDb && !hasDbDump) {
      dbErrors.push('归档不含数据库转储（pg/dump.pg_dump），本次未还原数据库');
    }

    // --- 4. 替换文件（非破坏性覆盖，不覆盖 .env）---
    const targetData = path.join(BACKEND_ROOT, 'data');
    const targetUploads = path.join(BACKEND_ROOT, 'uploads');
    const skipped = [];
    if (opts.includeData !== false) skipped.push(...overlayFromStage(stageData, targetData));
    if (opts.includeUploads !== false) skipped.push(...overlayFromStage(stageUploads, targetUploads));

    logger.info(`[RESTORE] ${scope} 恢复完成：来源 ${details.hostname}，快照 ${path.basename(snapshot.file)}，数据库:${dbResult}${dbErrors.length ? `，错误:${dbErrors.join(';')}` : ''}`);

    const message = dbErrors.length
      ? `恢复完成，但数据库存在异常：${dbErrors.join('；')}。请重启后端服务后核对。`
      : (dbResult === 'skip' ? '仅还原了文件（归档不含数据库或未选择数据库）。请重启后端服务使数据生效。' : '恢复完成，请重启后端服务使数据生效。');

    return {
      ok: true,
      dryRun: false,
      scope,
      message,
      details: {
        ...details,
        dbResult,
        snapshotFile: path.basename(snapshot.file),
        snapshotSize: snapshot.size,
        skipped,
        dbErrors,
      },
    };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// 供下载用：校验文件名防路径穿越，返回备份文件绝对路径或 null
function resolveBackupFile(filename) {
  const base = path.basename(String(filename || ''));
  if (!/^freight-(backup|prerestore)-\d{8}-\d{6}\.tar\.gz$/.test(base)) return null;
  const abs = path.join(backupDir(), base);
  return fs.existsSync(abs) ? abs : null;
}

module.exports = {
  createApiBackup,
  restoreApiArchive,
  resolveBackupFile,
  backupDir,
  listServerBackups,
  deleteServerBackup,
  inspectBackup,
  parsePgRestoreList,
  listDumpTables,
};