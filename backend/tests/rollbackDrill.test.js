// 回滚演练脚本测试（不依赖真实 PostgreSQL）
// 覆盖：归档内容核对、配置脱敏核查、结论判定、端到端演练（无 pg_dump 的备份应判 FAIL）。
// 全部只在临时目录内操作，绝不触碰生产数据。
// 运行：node --test --test-concurrency=1 tests/rollbackDrill.test.js
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { packToGzip } = require('../scripts/lib/tar');
const {
  check,
  runDrill,
  verifyEnvSanitized,
  verifyContentsConsistent,
  summarizeChecks,
} = require('../scripts/rollback-drill');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 构造一份假备份归档：manifest + 若干文件，可选是否含 pg_dump
async function makeFakeBackup(dir, { withPgDump = false, files = [] } = {}) {
  const entries = [];
  const manifestFiles = [];

  for (const f of files) {
    const buf = Buffer.from(f.content, 'utf8');
    entries.push({ name: f.name, type: 'file', size: buf.length, mode: 0o644, mtime: Date.now(), content: buf });
    manifestFiles.push({ path: f.name, size: buf.length });
  }
  if (withPgDump) {
    // 仅占位：让脚本认为含 pg_dump（有效性由 pg_restore --list 判定，这里不造真 dump）
    entries.push({ name: 'pg/dump.pg_dump', type: 'file', size: 8, mode: 0o600, mtime: Date.now(), content: Buffer.alloc(8) });
    manifestFiles.push({ path: 'pg/dump.pg_dump', size: 8 });
  }

  const manifest = {
    app: 'freight-system',
    createdAt: new Date().toISOString(),
    hostname: 'test-host',
    dbDialect: 'postgres',
    dbBackup: withPgDump ? { file: 'pg/dump.pg_dump', size: 8 } : null,
    fileCount: manifestFiles.length,
    totalBytes: manifestFiles.reduce((s, f) => s + f.size, 0),
    files: manifestFiles,
  };
  const mbuf = Buffer.from(JSON.stringify(manifest), 'utf8');
  entries.unshift({ name: 'manifest.json', type: 'file', size: mbuf.length, mode: 0o644, mtime: Date.now(), content: mbuf });

  const file = path.join(dir, 'freight-backup-20260814-000000.tar.gz');
  await packToGzip(entries, file);
  return file;
}

describe('verifyContentsConsistent（归档内容与 manifest 核对）', () => {
  test('全部一致 → ok', () => {
    const manifest = { files: [{ path: 'data/a.txt', size: 3 }, { path: 'uploads/b.txt', size: 5 }] };
    const entries = [
      { type: 'file', name: 'data/a.txt', size: 3 },
      { type: 'file', name: 'uploads/b.txt', size: 5 },
      { type: 'directory', name: 'data/', size: 0 },
    ];
    const r = verifyContentsConsistent(manifest, entries);
    assert.equal(r.ok, true);
    assert.equal(r.mismatch, 0);
  });

  test('大小不符 → 不一致', () => {
    const manifest = { files: [{ path: 'data/a.txt', size: 3 }] };
    const entries = [{ type: 'file', name: 'data/a.txt', size: 99 }];
    const r = verifyContentsConsistent(manifest, entries);
    assert.equal(r.ok, false);
    assert.equal(r.mismatch, 1);
  });

  test('文件缺失 → 不一致', () => {
    const manifest = { files: [{ path: 'data/ghost.txt', size: 3 }] };
    const entries = [];
    const r = verifyContentsConsistent(manifest, entries);
    assert.equal(r.ok, false);
    assert.equal(r.mismatch, 1);
  });

  test('缺 manifest.files 或 entries → 无法核对', () => {
    assert.equal(verifyContentsConsistent(null, []).ok, false);
    assert.equal(verifyContentsConsistent({}, []).ok, false);
    assert.equal(verifyContentsConsistent({ files: [] }, null).ok, false);
  });
});

describe('verifyEnvSanitized（配置脱敏核查）', () => {
  function writeEnv(content) {
    const dir = tmpDir('freight-drill-sani-');
    const abs = path.join(dir, '.env');
    fs.writeFileSync(abs, content, 'utf8');
    return { dir, abs };
  }

  test('敏感键已脱敏为 *** → 无泄漏', () => {
    const { dir, abs } = writeEnv(
      ['DB_HOST=127.0.0.1', 'DB_PASSWORD=***', 'JWT_SECRET=***', 'API_KEY=***', 'UPLOAD_MAX_KB=20480'].join('\n')
    );
    try {
      const r = verifyEnvSanitized(abs);
      assert.equal(r.leaked, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('发现明文敏感值 → 记录泄漏键', () => {
    const { dir, abs } = writeEnv(
      ['DB_PASSWORD=***', 'JWT_SECRET=real-secret', 'API_KEY=abc123'].join('\n')
    );
    try {
      const r = verifyEnvSanitized(abs);
      assert.equal(r.leaked, 2);
      assert.ok(r.leakedKeys.includes('JWT_SECRET'));
      assert.ok(r.leakedKeys.includes('API_KEY'));
      assert.ok(!r.leakedKeys.includes('DB_PASSWORD'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('summarizeChecks（结论判定）', () => {
  test('全部通过 → PASS', () => {
    assert.equal(summarizeChecks([check('a', true, ''), check('b', true, '', { warn: true })]), 'PASS');
  });

  test('有非关键 warn 未通过 → WARN', () => {
    assert.equal(summarizeChecks([check('a', true, ''), check('warn', false, '', { warn: true })]), 'WARN');
  });

  test('关键项失败 → FAIL，优先于 WARN', () => {
    assert.equal(
      summarizeChecks([check('a', true, ''), check('warn', false, '', { warn: true }), check('crit', false, '', { critical: true })]),
      'FAIL'
    );
  });
});

describe('端到端演练（runDrill，无 PostgreSQL）', () => {
  test('备份不含 pg_dump → 业务数据检查失败，结论 FAIL，且不修改生产数据', async () => {
    const dir = tmpDir('freight-drill-e2e-');
    const oldDir = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    const archive = await makeFakeBackup(dir, {
      files: [{ name: 'data/hello.txt', content: 'hi' }, { name: 'uploads/doc.pdf', content: 'pdf' }],
    });
    try {
      const { verdict, summary } = await runDrill({ flags: new Set(['json']), opts: {} }, [archive]);
      assert.equal(verdict, 'FAIL');
      const biz = summary.checks.find((c) => c.name === '业务数据（pg_dump）');
      assert.ok(biz && !biz.pass, '无 pg_dump 的业务数据检查应失败');
      // 演练只写临时工作目录，不向备份目录之外落任何文件
      assert.deepEqual(fs.readdirSync(dir), ['freight-backup-20260814-000000.tar.gz'], '演练不得在备份目录新增文件');
    } finally {
      process.env.BACKUP_DIR = oldDir;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});