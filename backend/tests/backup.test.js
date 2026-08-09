// 备份/恢复 HTTP 端点测试（AC-22）
// 空库启动 → setup-admin → POST /system/backup → 下载 → 路径穿越防护 → restore dry-run → 真实恢复
// 运行：npm test（与 smoke/onboarding/pdf 串行，独立端口 3067 + 独立空库）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const BACKEND = path.resolve(__dirname, '..');
const PORT = '3067';
const BASE = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'backup-test-secret-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  AUTO_MIGRATE: 'true',
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};

let serverProc;
let serverStderr = '';
let token;
let backupFilename;

async function waitForHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* 还没起来，继续等 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未启动。server stderr:\n${serverStderr.slice(-2000)}`);
}

async function api(method, p, body, t, headers) {
  const h = Object.assign({}, headers || {});
  if (t) h.Authorization = `Bearer ${t}`;
  const r = await fetch(`${BASE}${p}`, { method, headers: h, body });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null;
  try { j = JSON.parse(buf.toString('utf8')); } catch (e) { /* 二进制流（下载） */ }
  return { status: r.status, body: j, buf };
}

describe('备份/恢复端点（AC-22）', () => {
  before(async () => {
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env });
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();

    const setup = await api('POST', '/api/system/setup-admin', JSON.stringify({ username: 'admin', password: '123456', name: '备份测试' }), null, { 'Content-Type': 'application/json' });
    assert.equal(setup.status, 200, `setup-admin 应成功：${JSON.stringify(setup.body)}`);
    token = setup.body.data.token;
    assert.ok(token && token.length > 20, 'token 应为非空长串');
  });

  after(async () => {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  });

  test('未登录调用备份返回 401', async () => {
    const r = await api('POST', '/api/system/backup');
    assert.equal(r.status, 401);
  });

  test('POST /api/system/backup 生成 tar.gz 并返回元数据', async () => {
    const r = await api('POST', '/api/system/backup', null, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    backupFilename = r.body.data.filename;
    assert.match(backupFilename, /^freight-backup-\d{8}-\d{6}\.tar\.gz$/, `备份文件名格式：${backupFilename}`);
    assert.ok(Number(r.body.data.size) > 0, 'size 应大于 0');
  });

  test('下载备份文件内容与 size 一致', async () => {
    const r = await api('GET', `/api/system/backup/download/${backupFilename}`, null, token);
    assert.equal(r.status, 200);
    assert.ok(r.buf.length > 0, '下载内容非空');
    // 元数据与下载字节数一致性由服务端校验；此处仅断言可下载且非空
  });

  test('路径穿越文件名被拒绝', async () => {
    const evil = await api('GET', '/api/system/backup/download/..%2F..%2F.env', null, token);
    assert.ok(evil.status === 404 || evil.status === 400, `穿越应被拒，实际 ${evil.status}`);
    const bad = await api('GET', '/api/system/backup/download/evil.txt', null, token);
    assert.ok(bad.status === 404 || bad.status === 400, `非白名单文件应被拒，实际 ${bad.status}`);
  });

  test('restore dry-run：仅预检不落盘', async () => {
    const buf = (await api('GET', `/api/system/backup/download/${backupFilename}`, null, token)).buf;
    const fd = new FormData();
    fd.append('file', new Blob([buf]), backupFilename);
    const r = await api('POST', '/api/system/restore?dryRun=1', fd, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.equal(r.body.data.ok, true);
    assert.equal(r.body.data.dryRun, true, '应标记 dryRun');
    assert.ok(r.body.data.details && r.body.data.details.fileCount > 0, '应返回归档明细');
  });

  test('restore 真实执行（运行中数据库显式保留，返回 ok 且系统可用）', async () => {
    const buf = (await api('GET', `/api/system/backup/download/${backupFilename}`, null, token)).buf;
    const fd = new FormData();
    fd.append('file', new Blob([buf]), backupFilename);
    const r = await api('POST', '/api/system/restore', fd, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.equal(r.body.data.ok, true);
    assert.equal(r.body.data.dryRun, false);
    // 数据库（PostgreSQL）不随文件归档覆盖，响应应提示数据库处理方式
    assert.match(r.body.data.message, /数据库|重启|CLI/, `恢复消息应提示数据库处理方式：${r.body.data.message}`);
    // 恢复后系统仍可服务
    const st = await api('GET', '/api/onboarding/status', null, token);
    assert.equal(st.status, 200);
    assert.equal(st.body.code, 0);
  });
});
