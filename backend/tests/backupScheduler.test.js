// 备份调度单元测试：强制月度备份 + 超期检查/补备 + 结果提醒
//
// 策略：不连真实数据库、不执行真实 pg_dump。在 require backupScheduler 之前，
// 先替换其依赖（scripts/backup.createBackup、backupRestoreService.listServerBackups、
// notificationService.push、eventBus.emit）为可断言的 mock。
// 因 require 缓存 + 解构发生在模块顶层，mock 会随解构被一并捕获。
// 运行：node --test --test-concurrency=1 tests/backupScheduler.test.js
const { describe, test, after, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 独立临时目录，避免污染真实备份目录
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-sch-'));
// 强制默认开启（fail-closed），不显式写 BACKUP_AUTO
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'backup-sch-' + Math.random().toString(36).slice(2);
process.env.BACKUP_DIR = path.join(TMP, 'backups');
process.env.BACKUP_MAX_AGE_DAYS = '35';
process.env.BACKUP_KEEP = '7';

// ── mock 依赖（require 前替换）─────────────────────────────
const backupScript = require('../scripts/backup');
const restoreSvc = require('../src/services/backupRestoreService');
const notifSvc = require('../src/services/notificationService');
const eventBus = require('../src/services/eventBus');

const calls = { emit: [], push: [], create: [] };
let fakeBackups = []; // [{mtime, kind:'backup'}]
let createImpl = async (opts) => {
  // 模拟一次成功备份：在 BACKUP_DIR 生成一个真实命名文件，便于 listServerBackups 逻辑自洽
  const dir = opts.outDir || path.join(TMP, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const fname = `freight-backup-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8)}-${String(Date.now()).slice(-6)}.tar.gz`;
  fs.writeFileSync(path.join(dir, fname), 'fake');
  calls.create.push({ reason: opts.reason, file: fname });
  return { file: path.join(dir, fname), size: 4, entries: 1, warnings: [] };
};

backupScript.createBackup = createImpl;
backupScript.pgDumpAvailable = () => false;
// 让 listServerBackups 基于真实目录 + 我们注入的 fakeBackups 返回
restoreSvc.backupDir = () => path.join(TMP, 'backups');
restoreSvc.listServerBackups = () => [...fakeBackups];
notifSvc.push = async (data) => { calls.push.push(data); return { ok: true }; };
eventBus.emit = (name, payload) => { calls.emit.push({ name, payload }); };

// ── 被测模块（在 mock 之后加载）────────────────────────────
const scheduler = require('../src/services/backupScheduler');
const config = require('../src/config');

describe('备份调度服务', () => {
  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  test('config.backup 默认强制开启（fail-closed）', () => {
    assert.strictEqual(config.backup.auto, true, '默认应强制开启');
    assert.strictEqual(config.backup.schedule, '30 3 1 * *', '默认月度 cron');
    assert.strictEqual(config.backup.maxAgeDays, 35, '默认超期阈值');
    assert.strictEqual(config.backup.keep, 7, '默认保留份数');
  });

  test('lastBackupAgeDays：从未备份返回 null', () => {
    fakeBackups = [];
    assert.strictEqual(scheduler.lastBackupAgeDays(), null);
  });

  test('lastBackupAgeDays：有备份返回天数（约 2 天）', () => {
    const mtime = new Date(Date.now() - 2 * 86400000).toISOString();
    fakeBackups = [{ kind: 'backup', mtime }];
    const d = scheduler.lastBackupAgeDays();
    assert.ok(d !== null && d > 1.9 && d < 2.1, `应约 2 天，实际 ${d}`);
  });

  test('checkBackupFreshness：未超期 → 跳过，不提醒不补备', async () => {
    calls.emit.length = 0; calls.push.length = 0; calls.create.length = 0;
    fakeBackups = [{ kind: 'backup', mtime: new Date().toISOString() }];
    const r = await scheduler.checkBackupFreshness({ forceBackup: true });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(calls.emit.length, 0, '不应发 backup.overdue');
    assert.strictEqual(calls.create.length, 0, '不应补备');
  });

  test('checkBackupFreshness：超期 → 提醒 + 强制补备', async () => {
    calls.emit.length = 0; calls.push.length = 0; calls.create.length = 0;
    fakeBackups = [{ kind: 'backup', mtime: new Date(Date.now() - 40 * 86400000).toISOString() }];
    const r = await scheduler.checkBackupFreshness({ forceBackup: true });
    assert.strictEqual(r.backedUp, true, '应完成补备');
    assert.ok(calls.emit.some((c) => c.name === 'backup.overdue'), '应发 backup.overdue');
    assert.ok(calls.push.some((c) => c.eventType === 'backup.overdue'), '应外发超期提醒');
    assert.ok(calls.create.length >= 1, '应执行一次备份');
  });

  test('checkBackupFreshness：超期但不强制 → 仅提醒不补备', async () => {
    calls.emit.length = 0; calls.push.length = 0; calls.create.length = 0;
    fakeBackups = [{ kind: 'backup', mtime: new Date(Date.now() - 40 * 86400000).toISOString() }];
    const r = await scheduler.checkBackupFreshness({ forceBackup: false });
    assert.strictEqual(r.backedUp, false, '非强制不应补备');
    assert.ok(calls.emit.some((c) => c.name === 'backup.overdue'), '仍应提醒');
    assert.strictEqual(calls.create.length, 0, '不应执行备份');
  });

  test('performBackup：备份成功 → 发 backup.completed + 外发提醒', async () => {
    calls.emit.length = 0; calls.push.length = 0; calls.create.length = 0;
    const meta = await scheduler.performBackup('monthly');
    assert.ok(meta.filename && meta.filename.endsWith('.tar.gz'), '应生成备份文件名');
    assert.strictEqual(meta.reason, 'monthly');
    assert.ok(calls.emit.some((c) => c.name === 'backup.completed'), '应发 backup.completed');
    assert.ok(calls.push.some((c) => c.eventType === 'backup.completed'), '应外发备份完成提醒');
  });

  test('startBackupScheduler：默认挂载月度 + 超期检查任务', () => {
    const r = scheduler.startBackupScheduler();
    assert.ok(r.jobs >= 2, `应挂载月度+每日检查任务，实际 ${r.jobs}`);
    scheduler.stopBackupScheduler();
  });

  test('startBackupScheduler：BACKUP_AUTO=off 时不挂载', () => {
    const prev = config.backup.auto;
    config.backup.auto = false;
    try {
      const r = scheduler.startBackupScheduler();
      assert.strictEqual(r.jobs, 0, '关闭时不挂载任何任务');
    } finally {
      config.backup.auto = prev;
    }
  });
});