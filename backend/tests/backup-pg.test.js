// P0-1 数据库备份逻辑单元测试（不依赖真实 PostgreSQL）
// 覆盖：pg_dump/pg_restore 参数构造、客户端可用性检测、--no-pg 仅文件备份路径。
// 运行：node --test tests/backup-pg.test.js
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBackup, pgDumpAvailable, buildPgDumpArgs, dbConfigFromEnv } = require('../scripts/backup');
const { pgRestoreAvailable, buildPgRestoreArgs } = require('../scripts/restore');

const CFG = { host: 'pg.example', port: '5432', name: 'freight', user: 'freight', password: 's3cret', ssl: false };

describe('pg_dump 参数构造', () => {
  test('custom 格式 + no-owner/no-password + 连接参数', () => {
    const args = buildPgDumpArgs(CFG, '/tmp/dump.pg_dump');
    assert.ok(args.includes('--format'), '应含 --format');
    assert.ok(args.includes('custom'), '应为 custom 格式');
    assert.ok(args.includes('--no-owner'));
    assert.ok(args.includes('--no-privileges'));
    assert.ok(args.includes('--no-password'));
    assert.ok(args.includes('--host') && args.includes('pg.example'));
    assert.ok(args.includes('--dbname') && args.includes('freight'));
    assert.ok(args.includes('--file'));
  });

  test('ssl 开启时追加 --sslmode=require', () => {
    const args = buildPgDumpArgs({ ...CFG, ssl: true }, '/tmp/dump.pg_dump');
    assert.ok(args.includes('--sslmode=require'));
  });
});

describe('pg_restore 参数构造', () => {
  test('--clean --if-exists 全量清空重建', () => {
    const args = buildPgRestoreArgs(CFG, '/tmp/dump.pg_dump');
    assert.ok(args.includes('--clean'));
    assert.ok(args.includes('--if-exists'));
    assert.ok(args.includes('--no-owner'));
    assert.ok(args.includes('--no-password'));
    assert.ok(args.includes('--dbname') && args.includes('freight'));
    assert.ok(args[args.length - 1] === '/tmp/dump.pg_dump', '末位应为 dump 文件');
  });
});

describe('客户端可用性检测', () => {
  test('pg_dump / pg_restore 可用性返回布尔值（不抛错）', () => {
    assert.equal(typeof pgDumpAvailable(), 'boolean');
    assert.equal(typeof pgRestoreAvailable(), 'boolean');
  });
});

describe('--no-pg 仅文件备份路径', () => {
  test('noPg=true 在不依赖 pg_dump 的情况下产出合法归档，manifest.dbBackup 为 null', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-bkpg-'));
    try {
      const r = await createBackup({ outDir, keep: 3, noPg: true });
      assert.ok(fs.existsSync(r.file), '应产出 tar.gz');
      assert.ok(r.size > 0, '归档非空');
      assert.equal(r.dbBackup, null, '跳过数据库时 dbBackup 应为 null');
      assert.ok(r.warnings.some((w) => /跳过数据库/.test(w)), '应提示已跳过数据库');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('默认（noPg 缺省）在 pg_dump 不可用时应失败中止，避免产出无业务数据的误导性备份', async (t) => {
    if (pgDumpAvailable()) {
      t.skip('本机已安装 pg_dump，跳过缺客户端场景');
      return;
    }
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freight-bkpg-'));
    try {
      await assert.rejects(
        createBackup({ outDir, keep: 3 }),
        /未找到 pg_dump/,
        '缺少 pg_dump 时应中止并给出明确提示'
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe('dbConfigFromEnv', () => {
  test('从环境变量读取连接（含默认值）', () => {
    const old = { ...process.env };
    delete process.env.DB_HOST;
    process.env.DB_NAME = 'myfreight';
    try {
      const cfg = dbConfigFromEnv();
      assert.equal(cfg.name, 'myfreight');
      assert.equal(cfg.host, '127.0.0.1');
      assert.equal(cfg.ssl, false);
    } finally {
      process.env = old;
    }
  });
});