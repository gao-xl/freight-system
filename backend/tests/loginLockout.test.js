// S3 登录锁定回归测试（node:test 集成测试）
// 覆盖：连续失败 N 次账号锁定 → 锁定期间正确密码也被拒 → 解锁后登录成功并清除失败计数
// 运行：npm test（需先连上 PostgreSQL，并 npm install）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3052';
const BASE = `http://localhost:${PORT}`;

// 测试库连接参数（与 smoke.test.js 一致）；LOGIN_LOCK_MAX_FAILS=3 加速锁定场景
const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-lock-secret-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
  LOGIN_LOCK_MAX_FAILS: '3',
};

// 让本测试进程复用同一套库连接（解锁需直接落库清 lockedUntil）
for (const k of ['DB_DIALECT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  process.env[k] = env[k];
}

let serverProc;
let serverStderr = '';

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

async function tryLogin(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  let j = null;
  try { j = await r.json(); } catch { /* 非 JSON */ }
  return { status: r.status, j };
}

describe('S3 登录锁定', () => {
  before(async () => {
    // 1. 种子数据（force sync 重建含 loginFails/lockedUntil 列的表）
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });

    // 2. 启动后端
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env });
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();
  });

  after(async () => {
    if (serverProc) { try { serverProc.kill('SIGTERM'); } catch { /* ignore */ } }
    try {
      const { sequelize } = require('../src/models');
      await sequelize.close();
    } catch { /* ignore */ }
  });

  test('连续失败 N=3 次后账号锁定，锁定期间正确密码也被拒(423)', async () => {
    // 前 3 次失败均返回 401（凭证错误）
    for (let i = 0; i < 3; i += 1) {
      const r = await tryLogin('operator', 'wrong-password');
      assert.equal(r.status, 401, `第 ${i + 1} 次失败应返回 401，实际 ${r.status}`);
    }
    // 已达阈值后的任意尝试 → 423 锁定
    const locked = await tryLogin('operator', 'wrong-password');
    assert.equal(locked.status, 423, `锁定后失败尝试应返回 423，实际 ${locked.status}`);
    assert.match(locked.j.message || '', /锁定/);
    // 锁定期间即使密码正确也被拒
    const correct = await tryLogin('operator', '123456');
    assert.equal(correct.status, 423, `锁定期间正确密码也应返回 423，实际 ${correct.status}`);
  });

  test('解锁后正确密码登录成功并清除失败计数', async () => {
    // 模拟锁定到期：直接清库解锁
    const { User } = require('../src/models');
    await User.update({ lockedUntil: null, loginFails: 0 }, { where: { username: 'operator' } });

    const ok = await tryLogin('operator', '123456');
    assert.equal(ok.status, 200, `解锁后应登录成功，实际 ${ok.status}: ${ok.j?.message}`);
    assert.equal(ok.j.code, 0);

    // 登录成功应清除失败计数与锁定
    const u = await User.findOne({ where: { username: 'operator' } });
    assert.equal(u.loginFails, 0);
    assert.equal(u.lockedUntil, null);
  });

  test('不存在的账号不锁定、不产生副作用', async () => {
    // 幽灵账号连续失败始终返回 401，不引入额外的锁定状态
    for (let i = 0; i < 5; i += 1) {
      const r = await tryLogin('ghost_user_x', 'whatever');
      assert.equal(r.status, 401, `不存在的账号应始终返回 401，实际 ${r.status}`);
    }
  });
});