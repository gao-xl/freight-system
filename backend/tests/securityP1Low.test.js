// P1-低 加固项回归测试（node:test 集成测试）
// 覆盖本次鉴权纵深防御加固：
//   V1 批量核销参数校验（非法金额/非法 ids → 400，合法 → 执行）
//   V2 放单批量审批参数校验（非法 ids → 400）
//   V3 导入/恢复备份上传 MIME 白名单（fileFilter 拒绝非白名单扩展名）
//   V4 分页 pageSize 钳制（超限回落至 500，不再透传任意大值）
//   A1 财务结账/锁帐/解锁审计留痕
//   A2 红字冲销审计留痕
//   A3 用户/角色权限变更审计留痕
//   A4 鉴权失败(401)/权限拒绝(403)可观测指标
//   B1 管理员手动解锁被登录锁定的账号
// 运行：node --test tests/securityP1Low.test.js（需连 PostgreSQL 测试库）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3054';
const BASE = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-do-not-use-in-prod-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '12345678',
  PORT,
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};
for (const k of ['DB_DIALECT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  process.env[k] = env[k];
}

let serverProc;
let serverStderr = '';
let adminToken;

async function waitForHealth(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未启动。stderr:\n${serverStderr.slice(-2000)}`);
}
async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const j = await r.json();
  assert.equal(j.code, 0, `登录失败 ${username}: ${j.message}`);
  return j.data.token;
}
async function api(method, p, token, body) {
  const r = await fetch(`${BASE}${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: r.status, text, j };
}

describe('P1-低 加固项回归测试', () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env, stdio: 'pipe' });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();
    adminToken = await login('admin');
    // 种子账号 mustChangePassword=true 会触发 forcePasswordChange 拦截业务路由；测试直接用原密码清除该标记后重登
    const { User } = require('../src/services/dataAccess');
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (adminUser) await adminUser.update({ mustChangePassword: false });
    adminToken = await login('admin');
  });

  after(async () => {
    if (serverProc) { try { serverProc.kill('SIGTERM'); } catch { /* ignore */ } }
    try { const { sequelize } = require('../src/models'); await sequelize.close(); } catch { /* ignore */ }
  });

  function audit(where) {
    return require('../src/models').AuditLog.findOne({ where, order: [['id', 'DESC']] });
  }

  // ---------------------------------------------------------------------------
  // V1 批量核销：参数校验拒绝非法金额/非法 ids；合法数组可执行
  // ---------------------------------------------------------------------------
  test('V1 批量核销：非法 amount(≤0) 与非法 ids 被 schema 拒绝(400)，合法可执行', async () => {
    // 非法金额：负数 → 400（修复前会进控制器被业务吞掉）
    const neg = await api('POST', '/api/finance/batch-writeoff', adminToken, { ids: [1], amount: -5 });
    assert.equal(neg.status, 400, `负数金额应 400，got=${neg.status}: ${neg.text}`);
    // 非法 ids（非数字）→ 400
    const badIds = await api('POST', '/api/finance/batch-writeoff', adminToken, { ids: 'abc' });
    assert.equal(badIds.status, 400, `非法 ids 应 400，got=${badIds.status}: ${badIds.text}`);
    // 空 ids → 400
    const empty = await api('POST', '/api/finance/batch-writeoff', adminToken, { ids: [] });
    assert.equal(empty.status, 400, `空 ids 应 400，got=${empty.status}: ${empty.text}`);

    // 合法数组：建一条应收 → 批量核销返回 200
    const { FinanceRecord, Order } = require('../src/services/dataAccess');
    const ord = await Order.findOne({ order: [['id', 'DESC']] });
    assert.ok(ord, '种子应含订单');
    const rec = await FinanceRecord.create({
      orderId: ord.id, direction: 'receivable', category: 'other', description: 'P1Low-V1', amount: 100, currency: 'USD', status: 'unpaid',
      groupId: null, ownerId: null,
    });
    const okRes = await api('POST', '/api/finance/batch-writeoff', adminToken, { ids: [rec.id] });
    assert.equal(okRes.status, 200, `合法批量核销应 200，got=${okRes.status}: ${okRes.text}`);
    assert.equal(okRes.j.data.done, 1, `应核销 1 条：${okRes.text}`);
  });

  // ---------------------------------------------------------------------------
  // V2 放单批量审批：参数校验拒绝非法 ids
  // ---------------------------------------------------------------------------
  test('V2 放单批量审批：非法 ids 被 schema 拒绝(400)，合法数组通过', async () => {
    const bad = await api('POST', '/api/release/batch-approve', adminToken, { ids: 'x,y', approve: true });
    assert.equal(bad.status, 400, `非法 ids 应 400，got=${bad.status}: ${bad.text}`);
    // 合法（记录不存在返回 failed 而非 400，证明参数已通过校验）
    const okRes = await api('POST', '/api/release/batch-approve', adminToken, { ids: [999999], approve: true });
    assert.equal(okRes.status, 200, `合法批量审批应 200，got=${okRes.status}: ${okRes.text}`);
    assert.equal(okRes.j.data.failed.length, 1, `记录不存在应进 failed`);
  });

  // ---------------------------------------------------------------------------
  // V3 上传 MIME 白名单：fileFilter 拒绝非白名单扩展名
  // ---------------------------------------------------------------------------
  test('V3 上传：导入接口拒绝非电子表格扩展名(400)，接受 .xlsx', async () => {
    // 用不含扩展名的 multipart 触发 fileFilter 拒绝
    const badBody = new FormData();
    badBody.append('file', new Blob(['dummy'], { type: 'application/octet-stream' }), 'evil.exe');
    const bad = await fetch(`${BASE}/api/customers/import`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
      body: badBody,
    });
    assert.equal(bad.status, 400, `非白名单文件应 400，got=${bad.status}`);

    // 白名单内 .xlsx 应通过（导入内容报业务错 or 成功，但不因文件类型被拒）
    const okBody = new FormData();
    okBody.append('file', new Blob([''], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ok.xlsx');
    const ok = await fetch(`${BASE}/api/customers/import`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}` },
      body: okBody,
    });
    // 不能是 400 文件类型错误（可为业务错误 200 或其它，但非"文件类型"）
    const txt = (await ok.text()) || '';
    assert.ok(ok.status !== 400 || !/文件类型/.test(txt), `.xlsx 不应因类型被拒: status=${ok.status} ${txt}`);
  });

  // ---------------------------------------------------------------------------
  // V4 分页钳制：超大 pageSize 回落到 500
  // ---------------------------------------------------------------------------
  test('V4 分页：invoiceList pageSize=99999 被钳制为 500', async () => {
    const r = await api('GET', '/api/finance/invoices?pageSize=99999', adminToken);
    assert.equal(r.status, 200, `分页应 200，got=${r.status}: ${r.text}`);
    assert.equal(r.j.data.pageSize, 500, `pageSize 应变更为 500，got=${r.j.data.pageSize}`);
  });

  // ---------------------------------------------------------------------------
  // A1 财务结账/锁帐/解锁审计
  // ---------------------------------------------------------------------------
  test('A1 审计：结账/锁帐/解锁后写入 close_period/lock_period/unlock_period', async () => {
    const now = new Date();
    const code = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const close = await api('POST', `/api/finance/periods/${code}/close`, adminToken, { note: 'P1Low' });
    assert.equal(close.status, 200, `结账应 200，got=${close.status}: ${close.text}`);
    assert.ok(await audit({ action: 'close_period', targetId: code }), `应有 close_period 审计记录`);

    const lock = await api('POST', `/api/finance/periods/${code}/lock`, adminToken, { note: 'P1Low' });
    assert.equal(lock.status, 200, `锁帐应 200，got=${lock.status}: ${lock.text}`);
    assert.ok(await audit({ action: 'lock_period', targetId: code }), `应有 lock_period 审计记录`);

    const unlock = await api('POST', `/api/finance/periods/${code}/unlock`, adminToken, { reason: 'P1Low' });
    assert.equal(unlock.status, 200, `解锁应 200，got=${unlock.status}: ${unlock.text}`);
    assert.ok(await audit({ action: 'unlock_period', targetId: code }), `应有 unlock_period 审计记录`);
  });

  // ---------------------------------------------------------------------------
  // A2 红字冲销审计
  // ---------------------------------------------------------------------------
  test('A2 审计：红字冲销后写入 red_letter_reversal', async () => {
    const { FinanceRecord, Order } = require('../src/services/dataAccess');
    const ord = await Order.findOne({ order: [['id', 'DESC']] });
    assert.ok(ord, '种子应含订单');
    const rec = await FinanceRecord.create({
      orderId: ord.id, direction: 'receivable', category: 'other', description: 'P1Low-reverse', amount: 50, currency: 'USD', status: 'unpaid',
      groupId: null, ownerId: null,
    });
    const r = await api('POST', `/api/finance/${rec.id}/reverse`, adminToken, { reason: 'P1Low 审计测试' });
    assert.equal(r.status, 200, `冲销应 200，got=${r.status}: ${r.text}`);
    assert.ok(await audit({ action: 'red_letter_reversal', targetId: String(rec.id) }), `应有 red_letter_reversal 审计记录`);
  });

  // ---------------------------------------------------------------------------
  // A3 用户/角色权限变更审计
  // ---------------------------------------------------------------------------
  test('A3 审计：分配用户角色与角色权限后写入 assign_roles / assign_permissions', async () => {
    const { User, Role } = require('../src/services/dataAccess');
    const bcrypt = require('bcryptjs');
    const u = await User.create({
      username: 'p1low_' + Date.now(), name: 'P1Low', password: await bcrypt.hash('tmp-123456', 10), role: 'operator', status: 'active',
    });
    const operatorRole = await Role.findOne({ where: { code: 'operator' } });
    assert.ok(operatorRole, '种子应含 operator 角色');
    const assign = await api('PUT', `/api/users/${u.id}/roles`, adminToken, { roleIds: [operatorRole.id] });
    assert.equal(assign.status, 200, `分配角色应 200，got=${assign.status}: ${assign.text}`);
    assert.ok(await audit({ action: 'assign_roles', targetId: String(u.id) }), `应有 assign_roles 审计记录`);

    // 角色权限绑定（用原权限回写，无实际变更副作用）
    const perms = await require('../src/services/dataAccess').Permission.findAll({ attributes: ['id'] });
    const permIds = perms.slice(0, 2).map((p) => p.id);
    const rp = await api('PUT', `/api/roles/${operatorRole.id}/permissions`, adminToken, { permissionIds: permIds });
    assert.equal(rp.status, 200, `角色权限应 200，got=${rp.status}: ${rp.text}`);
    assert.ok(await audit({ action: 'assign_permissions', targetId: String(operatorRole.id) }), `应有 assign_permissions 审计记录`);
  });

  // ---------------------------------------------------------------------------
  // A4 鉴权失败/权限拒绝可观测指标
  // ---------------------------------------------------------------------------
  test('A4 指标：401 鉴权失败计入 security_events_total{auth_fail}', async () => {
    // 先触发一个 401
    await api('GET', '/api/orders', 'invalid.token.here');
    const m = await api('GET', '/api/metrics', adminToken);
    assert.equal(m.status, 200, `metrics 应 200，got=${m.status}`);
    assert.ok(m.text.includes('security_events_total{type="auth_fail"'), `指标应含 auth_fail 计数`);
  });

  // ---------------------------------------------------------------------------
  // B1 管理员解锁被锁定的账号
  // ---------------------------------------------------------------------------
  test('B1 解锁：管理员可清除他人登录锁定状态（loginFails=0, lockedUntil=null）', async () => {
    const { User } = require('../src/services/dataAccess');
    const bcrypt = require('bcryptjs');
    const uname = 'p1low_lock' + Date.now();
    const u = await User.create({
      username: uname, name: 'P1LowLock', password: await bcrypt.hash('tmp-123456', 10), role: 'operator', status: 'active',
      loginFails: 5, lockedUntil: new Date(Date.now() + 3600 * 1000),
    });
    const r = await api('POST', `/api/auth/unlock/${uname}`, adminToken);
    assert.equal(r.status, 200, `解锁应 200，got=${r.status}: ${r.text}`);
    const after = await User.findByPk(u.id);
    assert.equal(after.loginFails, 0, `解锁后 loginFails 应为 0`);
    assert.equal(after.lockedUntil, null, `解锁后 lockedUntil 应为 null`);
    assert.ok(await audit({ action: 'unlock_account', targetId: String(u.id) }), `应有 unlock_account 审计记录`);
  });
});