// S4 二次认证(2FA)测试（node:test 集成 + 单元）
// 覆盖：标记用户登录返回暂态 → 错误码拒绝 → 正确 TOTP 通过签发会话 → 未标记用户直登
//       → 关总开关 fail-open → 敏感操作无 reauth 头 428 → 复核后放行；邮箱码限频/过期单测
// 运行：npm test（需先连上 PostgreSQL，并 npm install）
const { describe, test, before, after, mock } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3053';
const BASE = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-2fa-secret-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};
for (const k of ['DB_DIALECT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  process.env[k] = env[k];
}
// 同步加密密钥：确保 encryptSecret/decryptSecret 在测试进程与 server 进程之间一致
process.env.JWT_SECRET = env.JWT_SECRET;

let serverProc;
let serverStderr = '';
let TEST_SECRET = '';

async function waitForHealth(timeoutMs = 25000) {
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

async function post(pathname, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api${pathname}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  let j = null;
  try { j = await r.json(); } catch { /* 非 JSON */ }
  return { status: r.status, j };
}
async function login(username, password = '123456') {
  return post('/auth/login', { username, password });
}

describe('S4 二次认证', () => {
  before(async () => {
    // 1. 种子数据（force sync 重建含 twoFactor* 列的表）
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });

    // 2. 开启总开关 + TOTP 通道，并给 finance 用户绑定 TOTP
    const { CompanyProfile, User } = require('../src/models');
    const { encryptSecret } = require('../src/utils/crypto');
    const { authenticator } = require('otplib');
    TEST_SECRET = authenticator.generateSecret();
    // seed 不创建 CompanyProfile 行，需先建单行配置（生产环境由 onboarding 创建）
    const [profile] = await CompanyProfile.findOrCreate({ where: { id: 1 }, defaults: { companyName: '' } });
    await profile.update({ security2faEnabled: true, securityTotpEnabled: true });
    await User.update(
      { twoFactorEnabled: true, twoFactorType: 'totp', totpSecretEnc: encryptSecret(TEST_SECRET), totpVerifiedAt: new Date() },
      { where: { username: 'finance' } },
    );

    // 3. 启动后端
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
    mock.restoreAll();
  });

  test('标记用户登录返回暂态 pending，不签发正式 token', async () => {
    const r = await login('finance');
    assert.equal(r.status, 200);
    assert.equal(r.j.data.pending, true, '需 2FA 用户登录应返回 pending');
    assert.ok(r.j.data.pendingToken, '应返回 pendingToken');
    assert.ok(r.j.data.channels.includes('totp'), 'channels 应含 totp');
    assert.ok(!r.j.data.token, 'pending 态不应签发正式 token');
  });

  test('错误验证码被拒绝(401)', async () => {
    const r = await login('finance');
    const v = await post('/auth/2fa/verify', { pendingToken: r.j.data.pendingToken, code: '000000' });
    assert.equal(v.status, 401, `错误验证码应返回 401，实际 ${v.status}`);
  });

  test('缺失 pendingToken 返回 401 而非 500', async () => {
    const v = await post('/auth/2fa/verify', { code: '123456' });
    assert.equal(v.status, 401, `缺失 pendingToken 应返回 401，实际 ${v.status}`);
  });

  test('正确 TOTP 通过后签发正式会话', async () => {
    const { authenticator } = require('otplib');
    const r = await login('finance');
    const code = authenticator.generate(TEST_SECRET);
    const v = await post('/auth/2fa/verify', { pendingToken: r.j.data.pendingToken, code });
    assert.equal(v.status, 200, `正确验证码应返回 200，实际 ${v.status}: ${v.j?.message}`);
    assert.ok(v.j.data.token, '应签发 access token');
    assert.ok(v.j.data.user, '应返回用户信息');
  });

  test('未标记用户直接登录成功（无 pending）', async () => {
    const r = await login('operator');
    assert.equal(r.status, 200);
    assert.ok(!r.j.data.pending, '未标记用户不应进入 2FA 暂态');
    assert.ok(r.j.data.token, '应直接签发 token');
  });

  test('关闭总开关后 fail-open：已绑定用户也直接登录', async () => {
    const { CompanyProfile } = require('../src/models');
    await CompanyProfile.update({ security2faEnabled: false }, { where: {} });
    const r = await login('finance');
    assert.equal(r.status, 200);
    assert.ok(!r.j.data.pending, '关总开关后不应要求 2FA');
    assert.ok(r.j.data.token, '应直接签发 token');
  });

  test('敏感操作无 reauth 头 428，复核后放行', async () => {
    const { CompanyProfile } = require('../src/models');
    const { authenticator } = require('otplib');
    // 重新开启总开关
    await CompanyProfile.update({ security2faEnabled: true }, { where: {} });
    const lg = await login('finance');
    const v = await post('/auth/2fa/verify', { pendingToken: lg.j.data.pendingToken, code: authenticator.generate(TEST_SECRET) });
    const token = v.j.data.token;

    // 无 reauth 头 → 428
    const deny = await post('/finance/periods/2026-08/close', {}, token);
    assert.equal(deny.status, 428, `敏感操作无复核应 428，实际 ${deny.status}`);

    // 复核 → 拿到 reauthToken
    const ra = await post('/auth/2fa/reauth/verify', { code: authenticator.generate(TEST_SECRET) }, token);
    assert.equal(ra.status, 200, `复核应返回 200，实际 ${ra.status}`);
    const reauthToken = ra.j.data.reauthToken;

    // 带 reauth 头重试 → 不再 428（期次可能不存在返回其它状态，但只要不是 428 即证明复核通过）
    const headers = { 'Content-Type': 'application/json', 'X-Reauth-Token': reauthToken };
    const r2 = await fetch(`${BASE}/api/finance/periods/2026-08/close`, { method: 'POST', headers, body: JSON.stringify({}) });
    assert.notEqual(r2.status, 428, `带有效 reauth 头不应再 428，实际 ${r2.status}`);
  });

  test('单元：邮箱验证码限频与一次性消费', async () => {
    const notification = require('../src/services/notificationService');
    const svc = require('../src/services/twoFactorService');
    mock.method(notification, 'sendEmailTo', async () => ({ sent: true }));
    const user = { id: 99999, email: '2fa@example.com' };
    const first = await svc.sendEmailCode(user, { purpose: '登录' });
    assert.equal(first.sent, true);
    // 限频：60s 内再次发送 → skipped
    const second = await svc.sendEmailCode(user, { purpose: '登录' });
    assert.equal(second.skipped, true, '60s 内重发应被限频');
    // 正确码通过且一次性
    // 直接注入一个已知码以绕过限频
    const crypto = require('node:crypto');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    svc.emailStore.set(user.id, { code, expiresAt: Date.now() + 60000, lastSentAt: Date.now() - 70000, attempts: 0 });
    assert.equal(svc.verifyEmailCode(user, code), true, '正确验证码应通过');
    assert.equal(svc.verifyEmailCode(user, code), false, '验证码应一次性，二次使用应失败');
  });
});