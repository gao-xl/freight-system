#!/usr/bin/env node
'use strict';

/**
 * 一键恢复：从 backup.js 产出的 .tar.gz 还原数据库、上传文件与配置。
 *
 * 恢复是不可逆操作，所以流程固定为四步：
 *   1. 预检   校验归档能完整解开、manifest 合法，先解到临时目录，不碰现网数据
 *   2. 快照   把当前 data/uploads/配置 打成 freight-prerestore-*.tar.gz，恢复错了还能退回来
 *   3. 替换   清空并写入 data/ 与 uploads/
 *   4. 报告   打印恢复内容与回退命令
 *
 * 用法:
 *   node scripts/restore.js --list                     列出可用备份
 *   node scripts/restore.js <backup.tar.gz>            恢复数据库与上传文件
 *   node scripts/restore.js <backup.tar.gz> --with-env 同时覆盖当前 .env
 *   node scripts/restore.js <backup.tar.gz> --yes      跳过交互确认（供自动化调用）
 *   node scripts/restore.js <backup.tar.gz> --dry-run  只预检和打印，不落盘
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { extractGzip } = require('./lib/tar');
const { createBackup, humanSize, parseArgs } = require('./backup');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_PREFIX = 'freight-prerestore';

const HELP = `一键恢复 - 从备份 .tar.gz 还原数据库、上传文件与配置

用法:
  node scripts/restore.js --list                     列出可用备份
  node scripts/restore.js <backup.tar.gz>            恢复数据库与上传文件
  node scripts/restore.js <backup.tar.gz> --with-env 同时覆盖当前 .env
  node scripts/restore.js <backup.tar.gz> --yes      跳过交互确认（供自动化调用）
  node scripts/restore.js <backup.tar.gz> --dry-run  只预检和打印，不落盘

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
    console.log(`  数据库    ${countTree(stageData)} 个文件`);
    console.log(`  上传文件  ${countTree(stageUploads)} 个文件`);
    console.log(`  配置      ${fs.existsSync(stageEnv) ? '含 .env' : '不含 .env'}`);

    if (args.flags.has('dry-run')) {
      console.log('\n[dry-run] 预检通过，未修改任何数据。');
      return;
    }

    // --- 2. 确认 ---
    const targetData = path.join(BACKEND_ROOT, 'data');
    const targetUploads = path.join(BACKEND_ROOT, 'uploads');
    console.log('');
    console.log(`将覆盖 ${targetData}（当前 ${countTree(targetData)} 个文件）`);
    console.log(`将覆盖 ${targetUploads}（当前 ${countTree(targetUploads)} 个文件）`);

    if (!args.flags.has('yes')) {
      if (!process.stdin.isTTY) {
        console.error('[错误] 非交互环境请显式加 --yes 确认。');
        process.exit(1);
      }
      const answer = await ask('确认恢复？此操作会覆盖现有数据，输入 yes 继续: ');
      if (answer.toLowerCase() !== 'yes') {
        console.log('已取消，未做任何修改。');
        return;
      }
    }

    // --- 3. 快照当前状态 ---
    console.log('[快照] 备份当前状态，便于恢复失败时退回 ...');
    const snapshot = await createBackup({ outDir: dir, keep: 5, prefix: SNAPSHOT_PREFIX });
    console.log(`  已生成 ${snapshot.file}（${humanSize(snapshot.size)}）`);

    // --- 4. 替换 ---
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

    console.log('');
    console.log('[恢复完成]');
    console.log(`  数据库    ${countTree(targetData)} 个文件 -> ${targetData}`);
    console.log(`  上传文件  ${countTree(targetUploads)} 个文件 -> ${targetUploads}`);
    console.log(`  配置      ${envRestored === 'skip' ? '未覆盖当前 .env（如需覆盖加 --with-env）' : `已写入 ${envRestored}`}`);
    if (manifest.dbDialect && manifest.dbDialect !== 'sqlite') {
      console.log(`  注意      备份来自 ${manifest.dbDialect}，业务数据不在本地文件里，需另行用数据库工具恢复`);
    }
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

module.exports = { listBackups };
