#!/usr/bin/env node
'use strict';

/**
 * 回滚演练：无破坏性地验证一份备份"真的能恢复"。
 *
 * 为什么要演练：备份是"丢数据即死"的兜底，但"备份每天在跑"不等于"恢复时能成功"。
 * 本脚本不碰生产 data/uploads、不连带生产库，只在临时目录/临时库中把恢复流程走一遍，
 * 逐项打勾，最后给出 PASS / WARN / FAIL 结论——核心是确认"这份备份现在就能还原出可用数据"。
 *
 * 验证维度（全部无破坏）：
 *   1. 归档完整性   tar 能完整解开、头部校验和通过
 *   2. manifest    属于本系统、字段齐全
 *   3. 业务数据     归档含 pg_dump（不含业务数据的备份对回滚无意义 → 关键 FAIL）
 *   4. pg_dump 有效  pg_restore --list 能无破坏读出对象清单（只读元数据，不连库）
 *   5. 内容一致     解出的每个文件与 manifest.files 路径+大小逐一比对
 *   6. 配置脱敏     解出的 config/.env 敏感键必须为 ***，不得有明文密钥泄漏
 *   7. RPO 评估     备份距今跨度 vs 阈值（默认 24h，超限 WARN）
 *   8. 异地韧性     是否配置异地同步（未配置 WARN，回滚弹药仅本地单点）
 *   9. 完整还原演练 仅 --restore-to-temp 时执行：在临时库真还原 + 校验表数量 + 清理
 *
 * 用法（在 backend 目录执行）：
 *   node scripts/rollback-drill.js                         演练最新一份备份
 *   node scripts/rollback-drill.js <file>                  演练指定备份（文件名或路径）
 *   node scripts/rollback-drill.js --list                   列出可用备份
 *   node scripts/rollback-drill.js --json                   输出一行结构化 JSON 报告
 *   node scripts/rollback-drill.js --rpo-hours=24           RPO 告警阈值（默认 24）
 *   node scripts/rollback-drill.js --restore-to-temp        完整还原演练到临时库（隔离，需 PG 权限）
 *   node scripts/rollback-drill.js --notify                 结果外发通知（复用 ops 通知渠道）
 *
 * 环境变量：DRILL_RPO_HOURS 等价于 --rpo-hours；BACKUP_DIR 指定备份目录。
 *
 * 退出码：0=PASS，1=FAIL，2=WARN（可幂等执行，多用 --json 接入监控）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractGzip } = require('./lib/tar');
const { createBackup, humanSize, parseArgs, dbConfigFromEnv, pgDumpAvailable, SENSITIVE_ENV_KEY } = require('./backup');
const { listBackups } = require('./restore');
const { notify } = require('./lib/notify');

const BACKEND_ROOT = path.resolve(__dirname, '..');

const HELP = `回滚演练 - 无破坏性验证备份可恢复性

用法:
  node scripts/rollback-drill.js                         演练最新一份备份
  node scripts/rollback-drill.js <file>                  演练指定备份（文件名或路径）
  node scripts/rollback-drill.js --list                   列出可用备份
  node scripts/rollback-drill.js --json                   输出一行结构化 JSON 报告
  node scripts/rollback-drill.js --rpo-hours=24           RPO 告警阈值（默认 24）
  node scripts/rollback-drill.js --restore-to-temp        完整还原演练到临时库（隔离，需 PG 权限）
  node scripts/rollback-drill.js --notify                 结果外发通知

演练只读备份、写入临时目录/临时库，绝不修改生产 data/uploads 与生产库。
退出码：0=PASS，1=FAIL，2=WARN。`;

// ---------------------------------------------------------------- 单条检查记录

function check(name, pass, detail, { critical = false, warn = false } = {}) {
  return { name, pass: !!pass, critical, warn, detail: detail || '' };
}

// ---------------------------------------------------------------- 备份定位

function backupDir(args) {
  return path.resolve(args.opts.dir || process.env.BACKUP_DIR || path.join(BACKEND_ROOT, 'backups'));
}

function resolveArchive(args, positional) {
  const dir = backupDir(args);
  if (!positional.length) {
    const items = listBackups(dir);
    if (!items.length) throw new Error(`备份目录 ${dir} 为空，先执行 npm run backup 产生一份`);
    console.log(`[目标] 未指定备份，演练最新一份: ${items[0].file}`);
    return items[0].abs;
  }
  let archive = path.resolve(positional[0]);
  if (!fs.existsSync(archive)) {
    const inDir = path.join(dir, positional[0]);
    if (fs.existsSync(inDir)) archive = inDir;
  }
  if (!fs.existsSync(archive)) throw new Error(`备份文件不存在: ${positional[0]}`);
  return archive;
}

// ---------------------------------------------------------------- pg_dump 有效性与临时库还原

// pg_restore --list 只读 dump 元数据，不连库，无破坏。返回 { ok, tables, output }
function inspectPgDump(dumpFile) {
  const r = spawnSync('pg_restore', ['--list', dumpFile], {
    env: { ...process.env, PGPASSWORD: dbConfigFromEnv().password || '' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) return { ok: false, error: `无法启动 pg_restore：${r.error.message}` };
  if (r.status !== 0) return { ok: false, error: `pg_restore --list 失败(exit=${r.status})：${String(r.stderr || '').trim().slice(0, 300)}` };
  const out = String(r.stdout || '');
  const tables = out.split(/\r?\n/).filter((l) => /\bTABLE\b|\bTABLE DATA\b/.test(l)).length;
  return { ok: true, tables, output: out };
}

function psqlAvailable() {
  try {
    const r = spawnSync('psql', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function psql(database, sql) {
  const cfg = dbConfigFromEnv();
  const r = spawnSync('psql', [
    '--host', cfg.host, '--port', String(cfg.port), '--username', cfg.user,
    '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align',
    '--command', sql,
  ], { env: { ...process.env, PGPASSWORD: cfg.password || '' }, encoding: 'utf8' });
  return r;
}

// 在临时库完整走一遍还原：建库 → pg_restore → 校验表数量 → 清理。全程隔离。
async function restoreToTemp(dumpFile) {
  const cfg = dbConfigFromEnv();
  const tempDb = `freight_drill_${Date.now()}`;
  const steps = [];
  try {
    const create = psql(cfg.name, `CREATE DATABASE ${tempDb} TEMPLATE template0`);
    if (create.status !== 0) {
      throw new Error(`创建临时库失败：${String(create.stderr || '').trim().slice(0, 300)}`);
    }
    steps.push('已创建临时库');

    const restoreArgs = [
      '--host', cfg.host, '--port', String(cfg.port), '--username', cfg.user,
      '--dbname', tempDb, '--no-owner', '--no-privileges', '--no-password',
      '--clean', '--if-exists', dumpFile,
    ];
    if (cfg.ssl) restoreArgs.push('--sslmode=require');
    const rg = spawnSync('pg_restore', restoreArgs, {
      env: { ...process.env, PGPASSWORD: cfg.password || '' },
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (rg.status !== 0) {
      throw new Error(`临时库 pg_restore 失败(exit=${rg.status})：${String(rg.stderr || '').trim().slice(0, 500)}`);
    }
    steps.push('临时库还原成功');

    const count = psql(tempDb, "SELECT count(*) FROM pg_tables WHERE schemaname='public'");
    const tableCount = count.status === 0 ? parseInt(String(count.stdout || '0').trim() || '0', 10) : 0;
    steps.push(`临时库含 ${tableCount} 张业务表`);
    return { ok: tableCount > 0, tableCount, steps };
  } finally {
    const drop = psql(cfg.name, `DROP DATABASE IF EXISTS ${tempDb}`);
    steps.push(drop.status === 0 ? '已清理临时库' : '临时库清理失败（需人工 DROP）');
  }
}

// ---------------------------------------------------------------- 配置脱敏核查

// 归档内容一致性核对：manifest.files 记录的每个文件，解包结果里路径与大小都必须一致
function verifyContentsConsistent(manifest, entries) {
  if (!manifest || !Array.isArray(manifest.files) || !Array.isArray(entries)) {
    return { ok: false, reason: '缺少 manifest.files 或 entries，无法核对' };
  }
  const byPath = new Map(entries.filter((e) => e.type === 'file').map((e) => [e.name, e]));
  let mismatch = 0;
  let total = 0;
  for (const f of manifest.files) {
    total += 1;
    const got = byPath.get(f.path);
    if (!got || got.size !== f.size) mismatch += 1;
  }
  return { ok: mismatch === 0, mismatch, total, reason: `${total} 个文件，${mismatch} 个不一致` };
}

// 结论判定：任何 critical 项失败 → FAIL；否则有 warn 项 → WARN；否则 PASS
function summarizeChecks(checks) {
  const criticalFailed = checks.some((c) => c.critical && !c.pass);
  const warnHits = checks.some((c) => c.warn && !c.pass);
  return criticalFailed ? 'FAIL' : warnHits ? 'WARN' : 'PASS';
}

// ----------------------------------------------------------------

function verifyEnvSanitized(envAbs) {
  const raw = fs.readFileSync(envAbs, 'utf8');
  let leaked = 0;
  const leakedKeys = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    if (!SENSITIVE_ENV_KEY.test(m[1])) continue; // 只查敏感键
    const val = m[2];
    if (val.trim() !== '***' && val.trim() !== '') {
      leaked += 1;
      leakedKeys.push(m[1]);
    }
  }
  return { leaked, leakedKeys };
}

// ---------------------------------------------------------------- 主流程

async function runDrill(args, positional) {
  const checks = [];
  const started = Date.now();
  const archive = resolveArchive(args, positional);
  const dir = backupDir(args);
  const rpoHours = Number(args.opts['rpo-hours'] || process.env.DRILL_RPO_HOURS || 24);

  console.log(`[回滚演练] 备份: ${path.basename(archive)}`);
  console.log(`[回滚演练] 工作目录: ${BACKEND_ROOT}`);

  // --- 1. 归档完整性 + manifest ---
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-drill-'));
  let manifest = null;
  let entries = [];
  try {
    try {
      entries = await extractGzip(archive, stage);
      checks.push(check('归档完整性', true, `tar 完整解开，${entries.filter((e) => e.type === 'file').length} 个文件`));
    } catch (e) {
      checks.push(check('归档完整性', false, e.message, { critical: true }));
    }

    const manifestPath = path.join(stage, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        manifest = null;
      }
    }
    const manifestOk = manifest && manifest.app === 'freight-system';
    checks.push(check(
      'manifest 合法性',
      manifestOk,
      manifestOk ? `app=${manifest.app}，备份于 ${new Date(manifest.createdAt).toLocaleString('zh-CN')}，方言 ${manifest.dbDialect}` : 'manifest.json 缺失或不属于本系统',
      { critical: true }
    ));

    // --- 3. 业务数据存在 ---
    const hasDbDump = fs.existsSync(path.join(stage, 'pg', 'dump.pg_dump'));
    checks.push(check(
      '业务数据（pg_dump）',
      hasDbDump,
      hasDbDump ? `含 pg_dump（${humanSize(manifest && manifest.dbBackup ? manifest.dbBackup.size : fs.statSync(path.join(stage, 'pg', 'dump.pg_dump')).size)}）` : '归档不含数据库转储，回滚无业务数据',
      { critical: true }
    ));

    // --- 4. pg_dump 有效性（无破坏只读） ---
    if (hasDbDump) {
      const dumpFile = path.join(stage, 'pg', 'dump.pg_dump');
      if (!pgDumpAvailable()) {
        checks.push(check('pg_dump 有效性', false, '未找到 pg_restore（PostgreSQL 客户端），无法校验转储', { critical: true }));
      } else {
        const insp = inspectPgDump(dumpFile);
        checks.push(check(
          'pg_dump 有效性',
          insp.ok && insp.tables > 0,
          insp.ok ? `pg_restore --list 可读，含 ${insp.tables} 个业务对象` : insp.error || 'pg_restore --list 未读出任何对象',
          { critical: true }
        ));
      }
    }

    // --- 5. 归档内容与 manifest 一致 ---
    if (manifest && Array.isArray(manifest.files)) {
      const m = verifyContentsConsistent(manifest, entries);
      checks.push(check('归档内容与 manifest 一致', m.ok, m.ok ? `manifest 记录 ${m.total} 个文件，全部核对一致` : m.reason, { critical: true }));
    } else {
      checks.push(check('归档内容与 manifest 一致', false, 'manifest 无 files 清单，无法核对'));
    }

    // --- 6. 配置脱敏 ---
    const envOut = path.join(stage, 'config', '.env');
    if (fs.existsSync(envOut)) {
      const { leaked, leakedKeys } = verifyEnvSanitized(envOut);
      checks.push(check(
        '配置脱敏',
        leaked === 0,
        leaked === 0 ? '备份内 .env 敏感键已全部脱敏' : `发现 ${leaked} 个敏感键明文泄漏: ${leakedKeys.join(', ')}`,
        { critical: leaked > 0 }
      ));
    } else {
      checks.push(check('配置脱敏', true, '备份不含 .env（未收录配置，跳过）'));
    }

    // --- 7. RPO 评估 ---
    if (manifest && manifest.createdAt) {
      const hours = (Date.now() - new Date(manifest.createdAt).getTime()) / 3600000;
      checks.push(check(
        'RPO 评估',
        hours <= rpoHours,
        `备份距今 ${hours.toFixed(1)}h / 阈值 ${rpoHours}h`,
        { warn: hours > rpoHours }
      ));
    }

    // --- 8. 异地韧性 ---
    const syncSet = Boolean(process.env.OPS_SYNC_DIR || process.env.OPS_SYNC_RSYNC);
    checks.push(check(
      '异地韧性',
      syncSet,
      syncSet ? '已配置备份异地同步（OPS_SYNC_DIR / OPS_SYNC_RSYNC）' : '未配置异地同步，回滚弹药仅本地单点',
      { warn: !syncSet }
    ));

    // --- 9. 完整还原演练（可选，隔离临时库） ---
    if (args.flags.has('restore-to-temp')) {
      const stagePg = path.join(stage, 'pg', 'dump.pg_dump');
      if (hasDbDump && fs.existsSync(stagePg)) {
        if (!pgDumpAvailable() || !psqlAvailable()) {
          checks.push(check('临时库完整还原', false, '缺少 pg_restore / psql（PostgreSQL 客户端），无法演练', { critical: true }));
        } else {
          const r = await restoreToTemp(stagePg);
          checks.push(check('临时库完整还原', r.ok, r.steps.join(' → '), { critical: true }));
        }
      } else {
        checks.push(check('临时库完整还原', false, '归档不含数据库转储，跳过完整还原', { critical: true }));
      }
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }

  // --- 汇总 ---
  const verdict = summarizeChecks(checks);
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);

  const width = Math.max(...checks.map((c) => c.name.length), 12) + 2;
  console.log('');
  console.log('─'.repeat(64));
  console.log('回滚演练报告'.padEnd(width) + `${verdict}`);
  console.log('─'.repeat(64));
  for (const c of checks) {
    const mark = c.pass ? 'PASS' : c.critical ? 'FAIL' : c.warn ? 'WARN' : 'FAIL';
    console.log(`  ${mark.padEnd(4)} ${c.name.padEnd(width - 4)} ${c.detail}`);
  }
  console.log('─'.repeat(64));
  console.log(`耗时 ${elapsed}s · 退出码 ${verdict === 'PASS' ? 0 : verdict === 'WARN' ? 2 : 1}`);

  const summary = {
    eventType: 'ops.drill',
    verdict,
    archive: path.basename(archive),
    dir,
    elapsed,
    time: new Date().toISOString(),
    checks: checks.map((c) => ({ name: c.name, pass: c.pass, critical: c.critical, warn: c.warn, detail: c.detail })),
  };

  if (args.flags.has('json')) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }

  if (args.flags.has('notify')) {
    const results = await notify({
      eventType: summary.eventType,
      title: `回滚演练${verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '有告警' : '失败'}`,
      message: [
        `备份：${summary.archive}`,
        `结论：${verdict}`,
        ...checks.map((c) => `[${c.pass ? '✓' : '✗'}] ${c.name} — ${c.detail}`),
        `耗时：${elapsed}s`,
      ].join('\n'),
      payload: summary,
    });
    const sent = results.filter((x) => x.status === 'sent').length;
    const failed = results.filter((x) => x.status === 'failed');
    console.log(`[通知] ${sent} 个渠道已发送${failed.length ? `，${failed.length} 个失败` : ''}`);
  }

  return { verdict, summary };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (args.flags.has('help') || args.flags.has('h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.flags.has('list')) {
    const items = listBackups(backupDir(args));
    if (!items.length) {
      console.log(`[备份目录] ${backupDir(args)}，暂无备份。先执行 npm run backup。`);
      process.exit(0);
    }
    const w = Math.max(...items.map((i) => i.file.length));
    console.log(`[备份目录] ${backupDir(args)}`);
    for (const it of items) {
      console.log(`  ${it.file.padEnd(w)}  ${humanSize(it.size).padStart(9)}  ${it.mtime.toLocaleString('zh-CN')}`);
    }
    process.exit(0);
  }

  const { verdict } = await runDrill(args, positional);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'WARN' ? 2 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[回滚演练失败] ${e.message}`);
    console.error('演练未完成，未修改任何生产数据。');
    process.exit(1);
  });
}

module.exports = { check, runDrill, restoreToTemp, inspectPgDump, verifyEnvSanitized, verifyContentsConsistent, summarizeChecks, backupDir };