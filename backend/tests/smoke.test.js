// 冒烟测试：启动真实后端 → 登录 → 业务接口 → 自动化幂等
// 使用 Node 22 内置 node:test + 全局 fetch，零额外依赖
// 运行：npm test  （需先连上 PostgreSQL，并 npm install）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const PORT = '3050';
const BASE = `http://localhost:${PORT}`;

// 测试库连接参数：默认 SQLite（项目定位 SQLite 默认，本地零依赖可跑）；
// CI/有 PostgreSQL 环境可用 TEST_DB_DIALECT=postgres + TEST_DB_* 覆盖（向后兼容）。
const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-do-not-use-in-prod-' + Math.random().toString(36).slice(2),
  DB_DIALECT: process.env.TEST_DB_DIALECT || 'sqlite',
  DB_STORAGE: process.env.TEST_DB_STORAGE || './data/test.db',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  // 测试环境关闭外部对接默认地址，避免启动时网络等待
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};

let serverProc;
let serverStderr = '';
let token;

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* 还没起来，继续等 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未启动。server stderr:\n${serverStderr.slice(-2000)}`);
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.code, 0);
  return j.data.token;
}

const authH = (t) => ({ Authorization: `Bearer ${t}` });

describe('冒烟测试', () => {
  before(async () => {
    // 1. 种子数据（force sync + 演示数据，写入 PostgreSQL 测试库）
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });

    // 2. 启动后端
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env });
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();
    token = await login();
  });

  after(async () => {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  });

  test('未登录访问受保护接口返回 401', async () => {
    const r = await fetch(`${BASE}/api/customers`);
    assert.equal(r.status, 401);
  });

  test('登录成功并返回 token', () => {
    assert.ok(token && token.length > 20, 'token 应为非空长串');
  });

  test('订单列表 200 且返回 list 数组', async () => {
    const r = await fetch(`${BASE}/api/orders`, { headers: authH(token) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.code, 0);
    assert.ok(Array.isArray(j.data.list), 'data.list 应为数组');
  });

  test('财务记录创建成功', async () => {
    const r = await fetch(`${BASE}/api/finance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(token) },
      body: JSON.stringify({
        orderId: 1,
        direction: 'receivable',
        category: 'ocean_freight',
        amount: 1000,
        currency: 'USD',
        dueDate: '2026-09-30',
      }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.code, 0, '财务创建应返回 code:0');
  });

  test('自动化幂等：二次运行不重复执行', async () => {
    const r1 = await fetch(`${BASE}/api/automation/run`, { method: 'POST', headers: authH(token) });
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.code, 0);

    const r2 = await fetch(`${BASE}/api/automation/run`, { method: 'POST', headers: authH(token) });
    assert.equal(r2.status, 200);
    const j2 = await r2.json();
    assert.equal(j2.code, 0);

    // 幂等：第二次运行不应再推进或新建应收
    assert.equal(j2.data.advanced, 0, '二次运行 advanced 应为 0');
    assert.equal(j2.data.financeCreated, 0, '二次运行 financeCreated 应为 0');
  });
});
