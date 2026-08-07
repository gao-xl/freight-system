#!/usr/bin/env node
'use strict';

/**
 * 一键备份：把数据库、上传文件、运行配置打成单个 .tar.gz。
 *
 * 设计前提：使用者是一人公司/小团队，没有专职运维。所以这里不引入任何第三方依赖，
 * 不要求宿主机装 tar，跑一条命令就出一个可直接拷走的文件。
 *
 * 用法：
 *   node scripts/backup.js                        立即备份一次
 *   node scripts/backup.js --keep=14              保留最近 14 份（默认 7）
 *   node scripts/backup.js --out=/mnt/nas/freight 指定输出目录（默认 backend/backups）
 *   node scripts/backup.js --quiet                只输出备份文件路径，便于脚本取值
 *   node scripts/backup.js --cron="0 2 * * *"     常驻进程，按 cron 表达式定时备份
 *
 * 交给系统 crontab 更省资源（Linux / Docker 宿主机推荐）：
 *   0 2 * * * cd /app && node scripts/backup.js >> logs/backup.log 2>&1
 *
 * 环境变量：BACKUP_DIR / BACKUP_KEEP / BACKUP_CRON 等价于对应参数。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { packToGzip } = require('./lib/tar');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const PREFIX = 'freight-backup';

const HELP = `一键备份 - 把数据库、上传文件、运行配置打成单个 .tar.gz

用法:
  node scripts/backup.js                        立即备份一次
  node scripts/backup.js --keep=14              保留最近 14 份（默认 7）
  node scripts/backup.js --out=/mnt/nas/freight 指定输出目录（默认 backend/backups）
  node scripts/backup.js --quiet                只输出备份文件路径，便于脚本取值
  node scripts/backup.js --cron="0 2 * * *"     常驻进程，按 cron 表达式定时备份

环境变量: BACKUP_DIR / BACKUP_KEEP / BACKUP_CRON 等价于对应参数

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
  const warnings = [];

  fs.mkdirSync(outDir, { recursive: true });

  const dataDir = path.join(BACKEND_ROOT, 'data');
  const uploadsDir = path.join(BACKEND_ROOT, 'uploads');
  const entries = [];

  // 数据库文件先拷到临时目录再打包。SQLite 运行中随时可能被写入，
  // 直接流式读取有概率打出一个大小对不上的坏包；先做一次快照拷贝把这个窗口压到最小。
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-backup-'));
  try {
    if (fs.existsSync(dataDir)) {
      copyTree(dataDir, path.join(stage, 'data'));
      entries.push({ name: 'data/', type: 'directory', size: 0, mode: 0o755, mtime: Date.now() });
      walk(path.join(stage, 'data'), 'data', entries);
    } else {
      warnings.push('未找到 backend/data 目录，本次备份不含数据库');
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

    const dialect = process.env.DB_DIALECT || 'sqlite';
    if (dialect !== 'sqlite') {
      warnings.push(`当前 DB_DIALECT=${dialect}，业务数据在外部数据库中，本脚本只备份上传文件与配置；数据库请用 pg_dump 另行备份`);
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
    return { file, size: fs.statSync(file).size, entries: fileEntries.length, totalBytes, removed, warnings };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function runOnce(args) {
  const quiet = args.flags.has('quiet');
  const started = Date.now();
  const r = await createBackup({ outDir: args.opts.out, keep: args.opts.keep });

  if (quiet) {
    process.stdout.write(`${r.file}\n`);
    return r;
  }

  console.log('[备份完成]');
  console.log(`  文件   ${r.file}`);
  console.log(`  大小   ${humanSize(r.size)}（原始 ${humanSize(r.totalBytes)}，${r.entries} 个文件）`);
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

module.exports = { createBackup, applyRetention, humanSize, parseArgs, PREFIX };
