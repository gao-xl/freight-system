#!/usr/bin/env node
'use strict';

/**
 * 一键备份：把 PostgreSQL 业务库、上传文件、运行配置打成单个 .tar.gz。
 *
 * 业务数据（订单/财务/审计等）在 PostgreSQL 中，本脚本默认用 pg_dump（custom 格式）
 * 转储进归档，保证"备份成功"即含全部业务数据。pg_dump 失败会中止本次备份，
 * 避免产出"看起来成功、实则没有业务数据"的误导性备份。
 *
 * 设计前提：使用者是一人公司/小团队，没有专职运维。所以这里不引入任何第三方依赖，
 * 不要求宿主机装 tar，跑一条命令就出一个可直接拷走的文件。
 * 数据库转储依赖 PostgreSQL 客户端（pg_dump/pg_restore），Docker 镜像已内置；
 * 本机直跑若缺会给出明确提示，或显式用 --no-pg 跳过数据库（仅特殊场景，业务数据不备份）。
 *
 * 用法：
 *   node scripts/backup.js                        立即备份一次（默认含 pg_dump 业务库）
 *   node scripts/backup.js --keep=14              保留最近 14 份（默认 7）
 *   node scripts/backup.js --out=/mnt/nas/freight 指定输出目录（默认 backend/backups）
 *   node scripts/backup.js --quiet                只输出备份文件路径，便于脚本取值
 *   node scripts/backup.js --cron="0 2 * * *"     常驻进程，按 cron 表达式定时备份
 *   node scripts/backup.js --no-pg                跳过数据库转储（仅特殊场景用）
 *
 * 交给系统 crontab 更省资源（Linux / Docker 宿主机推荐）：
 *   0 2 * * * cd /app && node scripts/backup.js >> logs/backup.log 2>&1
 *
 * 环境变量：BACKUP_DIR / BACKUP_KEEP / BACKUP_CRON 等价于对应参数。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { packToGzip } = require('./lib/tar');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const PREFIX = 'freight-backup';

const HELP = `一键备份 - 把 PostgreSQL 业务库、上传文件、运行配置打成单个 .tar.gz

用法:
  node scripts/backup.js                        立即备份一次（默认含 pg_dump 业务库）
  node scripts/backup.js --keep=14              保留最近 14 份（默认 7）
  node scripts/backup.js --out=/mnt/nas/freight 指定输出目录（默认 backend/backups）
  node scripts/backup.js --quiet                只输出备份文件路径，便于脚本取值
  node scripts/backup.js --cron="0 2 * * *"     常驻进程，按 cron 表达式定时备份
  node scripts/backup.js --no-pg                跳过数据库转储（仅特殊场景，业务数据不备份）

环境变量: BACKUP_DIR / BACKUP_KEEP / BACKUP_CRON 等价于对应参数；BACKUP_NO_PG=1 等价于 --no-pg

数据库：默认用 pg_dump 转储业务库（需 PostgreSQL 客户端，Docker 镜像已内置）。
pg_dump 失败会中止备份，避免产出不含业务数据的误导性备份。

交给系统 crontab（Linux / Docker 宿主机更省资源）:
  0 2 * * * cd /app && node scripts/backup.js >> logs/backup.log 2>&1`;

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} };
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) out.flags.add(raw.slice(2));
    else out.opts[raw.slice(2, eq)] = raw.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- 采集

function walk(dir, baseInArchive, entries) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, item.name);
    const rel = `${baseInArchive}/${item.name}`;
    if (item.isDirectory()) {
      entries.push({ name: `${rel}/`, type: 'directory', size: 0, mode: 0o755, mtime: Date.now() });
      walk(abs, rel, entries);
      continue;
    }
    if (!item.isFile()) continue; // 符号链接等一律跳过，避免恢复出意外指向
    const st = fs.statSync(abs);
    entries.push({ name: rel, type: 'file', size: st.size, mode: st.mode, mtime: st.mtimeMs, source: abs });
  }
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, item.name);
    const to = path.join(dest, item.name);
    if (item.isDirectory()) copyTree(from, to);
    else if (item.isFile()) fs.copyFileSync(from, to);
  }
}

function findEnvFile() {
  // 后端进程用 dotenv 从工作目录读 .env，所以 backend/.env 优先；仓库根的 .env 作为兜底
  const candidates = [
    { abs: path.join(BACKEND_ROOT, '.env'), name: 'config/.env' },
    { abs: path.join(REPO_ROOT, '.env'), name: 'config/.env' },
    { abs: path.join(BACKEND_ROOT, '.env.example'), name: 'config/.env.example' },
    { abs: path.join(REPO_ROOT, '.env.example'), name: 'config/.env.example' },
  ];
  return candidates.find((c) => fs.existsSync(c.abs)) || null;
}

// ---------------------------------------------------------------- PostgreSQL 转储

// 从环境变量读取数据库连接（与 src/config 保持一致，脚本独立可用）
function dbConfigFromEnv() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || '5432',
    name: process.env.DB_NAME || 'freight',
    user: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  };
}

// 检测 PostgreSQL 客户端是否可用（pg_dump 在 PATH 中）
function pgDumpAvailable() {
  try {
    const r = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// 构造 pg_dump 参数（custom 格式：压缩 + 支持选择性/单表恢复）
function buildPgDumpArgs(cfg, outFile) {
  const args = [
    '--host', cfg.host,
    '--port', String(cfg.port),
    '--username', cfg.user,
    '--dbname', cfg.name,
    '--format', 'custom',
    '--no-owner',
    '--no-privileges',
    '--no-password',
    '--file', outFile,
  ];
  if (cfg.ssl) args.push('--sslmode=require');
  return args;
}

// 执行 pg_dump，成功返回 { file, size, host, dbName }，失败 reject（中止整次备份）
function runPgDump(outFile) {
  return new Promise((resolve, reject) => {
    const cfg = dbConfigFromEnv();
    const args = buildPgDumpArgs(cfg, outFile);
    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: cfg.password || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errOut = '';
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 pg_dump：${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump 失败(exit=${code})：${String(errOut).trim().slice(0, 500) || '未知错误'}`));
        return;
      }
      const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
      if (size === 0) {
        reject(new Error('pg_dump 产出 0 字节，备份中止（请检查数据库连接配置）'));
        return;
      }
      resolve({ file: outFile, size, host: cfg.host, dbName: cfg.name });
    });
  });
}

// ---------------------------------------------------------------- 保留策略

function applyRetention(dir, prefix, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return [];
  const re = new RegExp(`^${prefix}-\\d{8}-\\d{6}\\.tar\\.gz$`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()
    .reverse();
  const removed = [];
  for (const f of files.slice(keep)) {
    fs.rmSync(path.join(dir, f), { force: true });
    removed.push(f);
  }
  return removed;
}

// ---------------------------------------------------------------- 主流程

/**
 * 执行一次备份。
 * @returns {Promise<{file:string,size:number,entries:number,removed:string[],warnings:string[]}>}
 */
async function createBackup(options = {}) {
  const outDir = path.resolve(options.outDir || process.env.BACKUP_DIR || path.join(BACKEND_ROOT, 'backups'));
  const keep = Number(options.keep != null ? options.keep : process.env.BACKUP_KEEP || 7);
  const prefix = options.prefix || PREFIX;
  // 默认转储数据库；--no-pg / BACKUP_NO_PG=1 显式跳过（仅特殊场景，业务数据不备份）
  const noPg = options.noPg != null ? options.noPg : process.env.BACKUP_NO_PG === '1';
  const warnings = [];

  fs.mkdirSync(outDir, { recursive: true });

  const dataDir = path.join(BACKEND_ROOT, 'data');
  const uploadsDir = path.join(BACKEND_ROOT, 'uploads');
  const entries = [];

  // data/ 目录仅保留历史遗留文件，不作为数据库备份来源。
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-backup-'));
  try {
    if (fs.existsSync(dataDir)) {
      copyTree(dataDir, path.join(stage, 'data'));
      entries.push({ name: 'data/', type: 'directory', size: 0, mode: 0o755, mtime: Date.now() });
      walk(path.join(stage, 'data'), 'data', entries);
    }

    if (fs.existsSync(uploadsDir)) {
      entries.push({ name: 'uploads/', type: 'directory', size: 0, mode: 0o755, mtime: Date.now() });
      walk(uploadsDir, 'uploads', entries);
    } else {
      warnings.push('未找到 backend/uploads 目录，本次备份不含单证附件');
    }

    const envFile = findEnvFile();
    if (envFile) {
      const st = fs.statSync(envFile.abs);
      entries.push({ name: envFile.name, type: 'file', size: st.size, mode: 0o600, mtime: st.mtimeMs, source: envFile.abs });
      if (envFile.name.endsWith('.example')) warnings.push('未找到 .env，备份中收录的是 .env.example');
    } else {
      warnings.push('未找到任何环境配置文件');
    }

    // 数据库转储：默认执行，失败即中止（fail-closed），避免产出不含业务数据的误导性备份
    const dialect = process.env.DB_DIALECT || 'postgres';
    let dbBackup = null;
    if (noPg) {
      warnings.push('已显式跳过数据库转储（--no-pg / BACKUP_NO_PG=1），本次不含业务数据');
    } else if (dialect !== 'postgres') {
      warnings.push(`当前数据库方言为 ${dialect}，不支持 pg_dump，本次不含业务数据`);
    } else {
      if (!pgDumpAvailable()) {
        throw new Error('未找到 pg_dump（PostgreSQL 客户端）。请安装 PostgreSQL 客户端工具（Docker 镜像已内置；本机 apt install postgresql-client / apk add postgresql-client），或用 --no-pg 显式跳过数据库备份');
      }
      const dumpFile = path.join(stage, 'pg', 'dump.pg_dump');
      fs.mkdirSync(path.dirname(dumpFile), { recursive: true });
      dbBackup = await runPgDump(dumpFile);
      entries.push({ name: 'pg/', type: 'directory', size: 0, mode: 0o755, mtime: Date.now() });
      entries.push({ name: 'pg/dump.pg_dump', type: 'file', size: dbBackup.size, mode: 0o600, mtime: Date.now(), source: dumpFile });
    }

    const fileEntries = entries.filter((e) => e.type === 'file');
    const totalBytes = fileEntries.reduce((s, e) => s + e.size, 0);
    const manifest = {
      app: 'freight-system',
      kind: prefix === PREFIX ? 'backup' : 'pre-restore-snapshot',
      createdAt: new Date().toISOString(),
      hostname: os.hostname(),
      node: process.version,
      dbDialect: dialect,
      dbBackup: dbBackup ? { file: 'pg/dump.pg_dump', size: dbBackup.size, host: dbBackup.host, dbName: dbBackup.dbName } : null,
      fileCount: fileEntries.length,
      totalBytes,
      warnings,
      files: fileEntries.map((e) => ({ path: e.name, size: e.size })),
    };
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    entries.unshift({ name: 'manifest.json', type: 'file', size: manifestBuf.length, mode: 0o644, mtime: Date.now(), content: manifestBuf });

    const file = path.join(outDir, `${prefix}-${stamp()}.tar.gz`);
    await packToGzip(entries, file);

    const removed = applyRetention(outDir, prefix, keep);
    return {
      file,
      size: fs.statSync(file).size,
      entries: fileEntries.length,
      totalBytes,
      dbBackup,
      removed,
      warnings,
    };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function runOnce(args) {
  const quiet = args.flags.has('quiet');
  const started = Date.now();
  const r = await createBackup({ outDir: args.opts.out, keep: args.opts.keep, noPg: args.flags.has('no-pg') });

  if (quiet) {
    process.stdout.write(`${r.file}\n`);
    return r;
  }

  console.log('[备份完成]');
  console.log(`  文件   ${r.file}`);
  console.log(`  大小   ${humanSize(r.size)}（原始 ${humanSize(r.totalBytes)}，${r.entries} 个文件）`);
  if (r.dbBackup) console.log(`  数据库 ${r.dbBackup.dbName}@${r.dbBackup.host}:${r.dbBackup.size} B（pg_dump custom）`);
  else console.log(`  数据库 未包含（见下方提示）`);
  console.log(`  耗时   ${((Date.now() - started) / 1000).toFixed(2)}s`);
  console.log(`  时间   ${new Date().toLocaleString('zh-CN')}`);
  if (r.removed.length) console.log(`  清理   已删除 ${r.removed.length} 份过期备份: ${r.removed.join(', ')}`);
  for (const w of r.warnings) console.log(`  提示   ${w}`);
  console.log('');
  console.log(`恢复命令: node scripts/restore.js "${r.file}"`);
  return r;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has('help') || args.flags.has('h')) {
    console.log(HELP);
    return;
  }

  const cronExpr = args.opts.cron || process.env.BACKUP_CRON;
  if (!cronExpr) {
    await runOnce(args);
    return;
  }

  let cron;
  try {
    cron = require('node-cron');
  } catch (e) {
    console.error('[错误] --cron 需要 node-cron 依赖（后端已内置，请在 backend 目录执行 npm install）');
    process.exit(1);
  }
  if (!cron.validate(cronExpr)) {
    console.error(`[错误] cron 表达式非法: ${cronExpr}`);
    process.exit(1);
  }

  console.log(`[定时备份] 已启动，表达式 ${cronExpr}，进程常驻。停止请 Ctrl+C。`);
  await runOnce(args).catch((e) => console.error('[备份失败]', e.message));
  cron.schedule(cronExpr, () => {
    runOnce(args).catch((e) => console.error('[备份失败]', e.message));
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[备份失败]', e.message);
    process.exit(1);
  });
}

module.exports = {
  createBackup,
  applyRetention,
  humanSize,
  parseArgs,
  PREFIX,
  dbConfigFromEnv,
  pgDumpAvailable,
  buildPgDumpArgs,
  runPgDump,
};
