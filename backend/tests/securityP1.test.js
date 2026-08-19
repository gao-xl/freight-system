// P1 横向越权 / 垂直越权 / 凭据生命周期修复回归测试（node:test 集成测试）
// 覆盖本次 P1 安全整改的 6 个防线：
//   P1-A 流程越权：group 用户不得读/写他组订单的流程节点
//   P1-B 费用模板越权：group 用户不得读他组费用模板（admin 正控可读）
//   P1-C 号段正控：admin 仍可创建/更新号段，group 用户受 system:finance 守卫拦截
//   P1-D 待办越权读：/tasks/todo 聚合必须受数据隔离约束，group 用户不可见他组应收
//   P1-E 密钥生命周期：绑定用户被禁用后，其接口密钥立即失效
//   P1-F 二次因子复核：绑定/重绑 TOTP 必须先通过当前密码校验
// 运行：node --test tests/securityP1.test.js（需连 PostgreSQL 测试库）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3053';
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
let adminToken, operatorToken;
let isoGroupId;

async function waitForHealth(timeoutMs = 20000) {
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
const authH = (t) => ({ Authorization: `Bearer ${t}` });
async function api(method, p, token, body) {
  const r = await fetch(`${BASE}${p}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? authH(token) : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: r.status, text, j };
}

describe('P1 越权与凭据生命周期修复回归测试', () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env, stdio: 'pipe' });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();
    // 种子账号 mustChangePassword=true 会触发 forcePasswordChange 拦截业务路由；测试用原密码清除全部测试账号该标记后重登
    const { User } = require('../src/models');
    for (const uname of ['admin', 'operator']) {
      const u = await User.findOne({ where: { username: uname } });
      if (u && u.mustChangePassword) await u.update({ mustChangePassword: false });
    }
    adminToken = await login('admin');
    operatorToken = await login('operator');

    // 隔离小组：把种子订单1归属进去（种子用户 groupId 为 null，operator=group 作用域看不到该组）
    const g = await api('POST', '/api/groups', adminToken, { name: 'P1隔离组', code: 'p1_iso' });
    assert.equal(g.status, 200, `创建小组失败: ${g.text}`);
    isoGroupId = g.j.data.id;
    const { Order } = require('../src/models');
    await Order.update({ groupId: isoGroupId }, { where: { id: 1 } });
  });

  after(async () => {
    if (serverProc) { try { serverProc.kill('SIGTERM'); } catch { /* ignore */ } }
    try { const { sequelize } = require('../src/models'); await sequelize.close(); } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // P1-A 流程越权：group 用户不得读 / 写他组订单的流程节点（orderNodes / updateOrderNode）
  // ---------------------------------------------------------------------------
  test('P1-A 流程越权：operator 无法读取他组订单流程节点，也无法改写其流程状态(404)', async () => {
    // 正控：admin(all) 可读取他组订单流程节点
    const adminRead = await api('GET', '/api/orders/1/nodes', adminToken);
    assert.equal(adminRead.status, 200, `admin 应可读他组订单流程: ${adminRead.text}`);
    assert.ok(Array.isArray(adminRead.j.data.nodes), 'admin 流程节点应为数组');

    // 反控：operator(group) 读取他组订单流程 → 404
    const opRead = await api('GET', '/api/orders/1/nodes', operatorToken);
    assert.equal(opRead.status, 404, `operator 读他组流程应 404, got=${opRead.status}`);

    // 反控：operator 改写他组订单流程状态 → 404（跨组写核心订单状态机）
    const opWrite = await api('PUT', '/api/orders/1/nodes/booking', operatorToken, { status: 'done' });
    assert.equal(opWrite.status, 404, `operator 改写他组流程应 404, got=${opWrite.status}`);

    // 正控：admin 可正常改写（写回 pending，避免污染）
    const adminWrite = await api('PUT', '/api/orders/1/nodes/booking', adminToken, { status: 'pending' });
    assert.equal(adminWrite.status, 200, `admin 改写他组流程应成功: ${adminWrite.text}`);
  });

  // ---------------------------------------------------------------------------
  // P1-B 费用模板越权：group 用户不得读他组费用模板；admin(all) 可读
  // ---------------------------------------------------------------------------
  test('P1-B 费用模板越权：operator 无法读取他组费用模板，admin 可读', async () => {
    const { FeeTemplate } = require('../src/models');
    const tpl = await FeeTemplate.create({
      name: 'P1隔离模板-' + Date.now(),
      items: JSON.stringify([{ direction: 'receivable', category: 'ocean_freight', description: '海运费', amount: 1000, currency: 'USD' }]),
      groupId: isoGroupId, ownerId: 1,
    });

    // 反控：operator(group, finance:read) 读取他组模板 → 404
    const opGet = await api('GET', `/api/fee-templates/${tpl.id}`, operatorToken);
    assert.equal(opGet.status, 404, `operator 读他组模板应 404, got=${opGet.status}`);

    // 反控：operator 更新他组模板被权限守卫拦截（finance:update 未授）
    const opUpd = await api('PUT', `/api/fee-templates/${tpl.id}`, operatorToken, { name: 'hacked' });
    assert.equal(opUpd.status, 403, `operator 更新他组模板应被守卫拦截 403, got=${opUpd.status}`);

    // 正控：admin(all) 可读
    const admGet = await api('GET', `/api/fee-templates/${tpl.id}`, adminToken);
    assert.equal(admGet.status, 200, `admin 应可读他组模板: ${admGet.text}`);

    // 清理
    await tpl.destroy();
  });

  // ---------------------------------------------------------------------------
  // P1-C 号段正控：admin(all) 仍可创建/更新/回卷 currentSeq；group 用户被 system:finance 拦截
  // ---------------------------------------------------------------------------
  test('P1-C 号段正控：admin 可创建并回卷 currentSeq，operator 被守卫 403 拦截', async () => {
    const prefix = 'P1N' + Math.floor(Math.random() * 100000);
    const create = await api('POST', '/api/number-segments', adminToken, {
      bizType: 'invoice_ar', prefix, startSeq: 1, endSeq: 999, digit: 8, enabled: true,
    });
    assert.equal(create.status, 200, `admin 创建号段应成功: ${create.text}`);
    const id = create.j.data.id;
    assert.equal(create.j.data.currentSeq, 0, '初始 currentSeq 应为 0');

    // 正控：admin 可回卷 currentSeq（本应允许的运维操作不被误伤）
    const upd = await api('PUT', `/api/number-segments/${id}`, adminToken, { currentSeq: 5, enabled: false });
    assert.equal(upd.status, 200, `admin 更新号段应成功: ${upd.text}`);
    assert.equal(upd.j.data.currentSeq, 5, 'currentSeq 应被更新为 5');

    // 反控：operator 无 system:finance 权限 → 403
    const opCreate = await api('POST', '/api/number-segments', operatorToken, { bizType: 'invoice_ar', prefix: 'XP1', digit: 8 });
    assert.equal(opCreate.status, 403, `operator 创建号段应 403, got=${opCreate.status}`);

    // 清理
    await api('DELETE', `/api/number-segments/${id}`, adminToken);
  });

  // ---------------------------------------------------------------------------
  // P1-D 待办越权读：/tasks/todo 聚合必须受数据隔离约束，group 用户不可见他组应收
  // ---------------------------------------------------------------------------
  test('P1-D 待办越权读：operator 的 /tasks/todo 不含他组订单超期应收，admin 可见', async () => {
    const { FinanceRecord } = require('../src/models');
    const TAG = 'P1ISO-OVERDUE-' + Date.now();
    const AMT = '1234.5';
    const rec = await FinanceRecord.create({
      orderId: 1, groupId: isoGroupId, ownerId: 1,
      direction: 'receivable', category: 'ocean_freight', description: TAG,
      amount: Number(AMT), currency: 'USD', status: 'unpaid',
      dueDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    });

    // 待办渲染的消息为「{订单号} 应收 {amount} 已逾期」，不含 description，故按金额断言
    // 正控：admin(all) 的待办聚合包含该他组超期应收
    const adminTodo = await api('GET', '/api/tasks/todo', adminToken);
    assert.equal(adminTodo.status, 200, `admin 取待办应成功: ${adminTodo.text}`);
    const adminMsgs = (adminTodo.j.data.items || []).map((it) => it.message).join('|');
    assert.ok(adminMsgs.includes(AMT), 'admin 待办聚合应包含他组超期应收金额');

    // 反控：operator(group) 的待办聚合不得包含他组超期应收
    const opTodo = await api('GET', '/api/tasks/todo', operatorToken);
    assert.equal(opTodo.status, 200, `operator 取待办应成功: ${opTodo.text}`);
    const opMsgs = (opTodo.j.data.items || []).map((it) => it.message).join('|');
    assert.ok(!opMsgs.includes(AMT), 'operator 待办聚合不得包含他组超期应收金额');

    // 清理
    await rec.destroy();
  });

  // ---------------------------------------------------------------------------
  // P1-E 密钥生命周期：绑定用户被禁用后，其接口密钥立即失效
  // ---------------------------------------------------------------------------
  test('P1-E 密钥生命周期：绑定用户禁用后接口密钥立即失效', async () => {
    const { User } = require('../src/models');
    const apiKeyService = require('../src/services/apiKeyService');
    const pwd = await bcrypt.hash('tmp-pass-12345', 10);
    const u = await User.create({ username: 'p1_apikey' + Date.now(), name: '密钥测试', role: 'operator', password: pwd, status: 'active' });

    const { plainKey } = await apiKeyService.createKey({ name: 'p1-key', role: 'operator', userId: u.id });
    assert.equal((await apiKeyService.verifyPlainKey(plainKey))?.userId, u.id, '用户 active 时密钥应有效');

    // 模拟离职/禁用：置为非 active
    await u.update({ status: 'disabled' });
    assert.equal(await apiKeyService.verifyPlainKey(plainKey), null, '用户禁用后密钥必须失效');

    // 清理
    const { ApiKey } = require('../src/models');
    await ApiKey.destroy({ where: { userId: u.id } });
    await u.destroy();
  });

  // ---------------------------------------------------------------------------
  // P1-F 二次因子复核：绑定/重绑 TOTP 必须先通过当前密码校验
  // ---------------------------------------------------------------------------
  test('P1-F 二次因子复核：TOTP 绑定需当前密码，绑定后可用当前密码解绑(不留状态)', async () => {
    // 反控：无密码 / 错误密码 → 403
    let r = await api('POST', '/api/auth/2fa/setup', adminToken, {});
    assert.equal(r.status, 403, `无密码绑定 TOTP 应 403, got=${r.status}`);
    r = await api('POST', '/api/auth/2fa/setup', adminToken, { password: 'wrong-password' });
    assert.equal(r.status, 403, `错误密码绑定 TOTP 应 403, got=${r.status}`);

    // 正控：正确密码 → 200 且返回 secret
    r = await api('POST', '/api/auth/2fa/setup', adminToken, { password: '123456' });
    assert.equal(r.status, 200, `正确密码绑定 TOTP 应成功: ${r.text}`);
    assert.ok(r.j.data.secret, '应返回 TOTP secret');

    // 清理：解绑（disable 同样需当前密码），不遗留 2FA 状态
    const dis = await api('POST', '/api/auth/2fa/disable', adminToken, { password: '123456' });
    assert.equal(dis.status, 200, `解绑 TOTP 应成功: ${dis.text}`);
  });
});