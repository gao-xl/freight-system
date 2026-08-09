#!/usr/bin/env node
'use strict';

/**
 * 一键恢复：从 backup.js 产出的 .tar.gz 还原 PostgreSQL 业务库、上传文件与配置。
 *
 * 恢复是不可逆操作，所以流程固定为四步：
 *   1. 预检   校验归档能完整解开、manifest 合法，先解到临时目录，不碰现网数据
 *   2. 快照   把当前 data/uploads/配置 打成 freight-prerestore-*.tar.gz，恢复错了还能退回来
 *   3. 替换   清空并写入 data/ 与 uploads/
 *   4. 数据库 若归档含 pg_dump（pg/dump.pg_dump），用 pg_restore 还原业务库（默认执行，--no-pg 跳过）
 *   5. 报告   打印恢复内容与回退命令
 *
 * 用法:
 *   node scripts/restore.js --list                     列出可用备份
 *   node scripts/restore.js <backup.tar.gz>            恢复数据库与上传文件
 *   node scripts/restore.js <backup.tar.gz> --with-env 同时覆盖当前 .env
 *   node scripts/restore.js <backup.tar.gz> --yes      跳过交互确认（供自动化调用）
 *   node scripts/restore.js <backup.tar.gz> --dry-run  只预检和打印，不落盘
 *   node scripts/restore.js <backup.tar.gz> --no-pg    跳过数据库还原（仅还原文件/配置）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const { extractGzip } = require('./lib/tar');
const { createBackup, humanSize, parseArgs, dbConfigFromEnv } = require('./backup');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_PREFIX = 'freight-prerestore';

const HELP = `一键恢复 - 从备份 .tar.gz 还原数据库、上传文件与配置

用法:
  node scripts/restore.js --list                     列出可用备份
  node scripts/restore.js <backup.tar.gz>            恢复数据库与上传文件
  node scripts/restore.js <backup.tar.gz> --with-env 同时覆盖当前 .env
  node scripts/restore.js <backup.tar.gz> --yes      跳过交互确认（供自动化调用）
  node scripts/restore.js <backup.tar.gz> --dry-run  只预检和打印，不落盘
  node scripts/restore.js <backup.tar.gz> --no-pg    跳过数据库还原（仅还原文件/配置）

数据库：归档含 pg/dump.pg_dump 时默认用 pg_restore 还原（--clean --if-exists，需 PostgreSQL
客户端，Docker 镜像已内置）。数据库还原会清空并重建当前库，交互确认后再执行。

恢复前会自动把当前状态打成 ${SNAPSHOT_PREFIX}-*.tar.gz 快照，可用它原路退回。
恢复完成后需重启后端服务使新数据生效。`;

function backupDir(args) {
  return path.resolve(args.opts.dir || process.env.BACKUP_DIR || path.join(BACKEND_ROOT, 'backups'));
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.tar\.gz$/.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { file: f, abs: path.join(dir, f), size: st.size, mtime: st.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function emptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const item of fs.readdirSync(dir)) fs.rmSync(path.join(dir, item), { recursive: true, force: true });
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

function countTree(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) n += countTree(path.join(dir, item.name));
    else n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- PostgreSQL 还原

function pgRestoreAvailable() {
  try {
    const r = spawnSync('pg_restore', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// 构造 pg_restore 参数：--clean --if-exists 先清掉现有对象再重建，完成全量还原
function buildPgRestoreArgs(cfg, dumpFile) {
  const args = [
    '--host', cfg.host,
    '--port', String(cfg.port),
    '--username', cfg.user,
    '--dbname', cfg.name,
    '--no-owner',
    '--no-privileges',
    '--no-password',
    '--clean',
    '--if-exists',
    dumpFile,
  ];
  if (cfg.ssl) args.push('--sslmode=require');
  return args;
}

// 执行 pg_restore，成功返回 { dbName, host }，失败 reject
function runPgRestore(dumpFile) {
  return new Promise((resolve, reject) => {
    const cfg = dbConfigFromEnv();
    const args = buildPgRestoreArgs(cfg, dumpFile);
    const child = spawn('pg_restore', args, {
      env: { ...process.env, PGPASSWORD: cfg.password || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errOut = '';
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 pg_restore：${e.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_restore 失败(exit=${code})：${String(errOut).trim().slice(0, 500) || '未知错误'}`));
        return;
      }
      resolve({ dbName: cfg.name, host: cfg.host });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (args.flags.has('help') || args.flags.has('h')) {
    console.log(HELP);
    return;
  }

  const dir = backupDir(args);

  if (args.flags.has('list')) {
    const items = listBackups(dir);
    if (!items.length) {
      console.log(`[备份目录] ${dir}`);
      console.log('暂无备份文件。先执行 npm run backup 生成一份。');
      return;
    }
    const nameWidth = Math.max(...items.map((i) => i.file.length));
    console.log(`[备份目录] ${dir}`);
    for (const it of items) {
      console.log(`  ${it.file.padEnd(nameWidth)}  ${humanSize(it.size).padStart(9)}  ${it.mtime.toLocaleString('zh-CN')}`);
    }
    console.log('');
    console.log('恢复: node scripts/restore.js <文件名>');
    return;
  }

  if (!positional.length) {
    console.error('[错误] 请指定备份文件。用 node scripts/restore.js --list 查看可用备份。');
    process.exit(1);
  }

  // 允许只传文件名，自动在备份目录里找
  let archive = path.resolve(positional[0]);
  if (!fs.existsSync(archive)) {
    const inDir = path.join(dir, positional[0]);
    if (fs.existsSync(inDir)) archive = inDir;
  }
  if (!fs.existsSync(archive)) {
    console.error(`[错误] 备份文件不存在: ${positional[0]}`);
    process.exit(1);
  }

  // --- 1. 预检：解到临时目录，确认归档完整 ---
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-restore-'));
  let manifest = null;
  try {
    console.log(`[预检] 解析 ${path.basename(archive)} ...`);
    const entries = await extractGzip(archive, stage);
    const manifestPath = path.join(stage, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    if (!manifest || manifest.app !== 'freight-system') {
      throw new Error('manifest.json 缺失或不属于本系统，拒绝恢复');
    }

    const stageData = path.join(stage, 'data');
    const stageUploads = path.join(stage, 'uploads');
    const stageEnv = path.join(stage, 'config', '.env');

    console.log(`  来源主机  ${manifest.hostname}`);
    console.log(`  备份时间  ${new Date(manifest.createdAt).toLocaleString('zh-CN')}`);
    console.log(`  数据方言  ${manifest.dbDialect}`);
    console.log(`  条目      ${entries.filter((e) => e.type === 'file').length} 个文件 / ${humanSize(manifest.totalBytes || 0)}`);
    const hasDbDump = fs.existsSync(path.join(stage, 'pg', 'dump.pg_dump'));
    console.log(`  业务库    ${hasDbDump ? `含 pg_dump（${humanSize((manifest.dbBackup && manifest.dbBackup.size) || fs.statSync(path.join(stage, 'pg', 'dump.pg_dump')).size)}）` : '无数据库转储，仅还原文件/配置'}`);
    console.log(`  本地 data ${countTree(stageData)} 个文件`);
    console.log(`  上传文件  ${countTree(stageUploads)} 个文件`);
    console.log(`  配置      ${fs.existsSync(stageEnv) ? '含 .env' : '不含 .env'}`);

    if (args.flags.has('dry-run')) {
      console.log('\n[dry-run] 预检通过，未修改任何数据。');
      return;
    }

    // --- 2. 确认 ---
    const targetData = path.join(BACKEND_ROOT, 'data');
    const targetUploads = path.join(BACKEND_ROOT, 'uploads');
    const stagePgDump = path.join(stage, 'pg', 'dump.pg_dump');
    const doDbRestore = hasDbDump && !args.flags.has('no-pg');
    const dbCfg = dbConfigFromEnv();
    if (doDbRestore && !pgRestoreAvailable()) {
      throw new Error('归档含数据库转储，但未找到 pg_restore（PostgreSQL 客户端）。Docker 镜像已内置；本机请安装 postgresql-client，或用 --no-pg 只还原文件/配置');
    }
    console.log('');
    console.log(`将覆盖 ${targetData}（当前 ${countTree(targetData)} 个文件）`);
    console.log(`将覆盖 ${targetUploads}（当前 ${countTree(targetUploads)} 个文件）`);
    if (doDbRestore) {
      console.log(`将用 pg_restore 覆盖业务库 ${dbCfg.name}@${dbCfg.host}:${dbCfg.port}（--clean 清空重建，务必确认目标正确）`);
    }

    if (!args.flags.has('yes')) {
      if (!process.stdin.isTTY) {
        console.error('[错误] 非交互环境请显式加 --yes 确认。');
        process.exit(1);
      }
      const scope = doDbRestore ? '此操作会覆盖本地文件并清空重建业务库' : '此操作会覆盖现有数据';
      const answer = await ask(`确认恢复？${scope}，输入 yes 继续: `);
      if (answer.toLowerCase() !== 'yes') {
        console.log('已取消，未做任何修改。');
        return;
      }
    }

    // --- 3. 快照当前状态（含当前业务库，便于回退；业务库 dump 失败则退化为仅文件快照，不阻塞恢复）---
    console.log('[快照] 备份当前状态，便于恢复失败时退回 ...');
    let snapshot;
    try {
      snapshot = await createBackup({ outDir: dir, keep: 5, prefix: SNAPSHOT_PREFIX, noPg: !doDbRestore });
    } catch (e) {
      console.log(`  [提示] 快照含业务库失败（${e.message}），改用仅文件快照（数据库回退不保证）`);
      snapshot = await createBackup({ outDir: dir, keep: 5, prefix: SNAPSHOT_PREFIX, noPg: true });
    }
    console.log(`  已生成 ${snapshot.file}（${humanSize(snapshot.size)}）`);

    // --- 4. 替换文件 ---
    if (fs.existsSync(stageData)) {
      emptyDir(targetData);
      copyTree(stageData, targetData);
    }
    if (fs.existsSync(stageUploads)) {
      emptyDir(targetUploads);
      copyTree(stageUploads, targetUploads);
    }

    let envRestored = 'skip';
    if (fs.existsSync(stageEnv)) {
      const targetEnv = path.join(BACKEND_ROOT, '.env');
      if (args.flags.has('with-env') || !fs.existsSync(targetEnv)) {
        fs.copyFileSync(stageEnv, targetEnv);
        envRestored = targetEnv;
      }
    }

    // --- 5. 还原业务库 ---
    let dbRestored = 'skip';
    if (doDbRestore) {
      console.log('[数据库] pg_restore 还原业务库 ...');
      await runPgRestore(stagePgDump);
      dbRestored = `${dbCfg.name}@${dbCfg.host}`;
    }

    console.log('');
    console.log('[恢复完成]');
    console.log(`  本地 data ${countTree(targetData)} 个文件 -> ${targetData}`);
    console.log(`  上传文件  ${countTree(targetUploads)} 个文件 -> ${targetUploads}`);
    console.log(`  配置      ${envRestored === 'skip' ? '未覆盖当前 .env（如需覆盖加 --with-env）' : `已写入 ${envRestored}`}`);
    console.log(`  业务库    ${dbRestored === 'skip' ? (hasDbDump ? '已按 --no-pg 跳过数据库还原' : '归档不含数据库转储，未操作') : `已还原 ${dbRestored}`}`);
    console.log('');
    console.log('请重启后端服务使数据生效: npm start（或 docker compose restart backend）');
    console.log(`恢复错了要退回: node scripts/restore.js "${snapshot.file}" --with-env`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[恢复失败]', e.message);
    console.error('现有数据未被修改，或可用 freight-prerestore-*.tar.gz 快照退回。');
    process.exit(1);
  });
}

module.exports = { listBackups, pgRestoreAvailable, buildPgRestoreArgs, runPgRestore };
