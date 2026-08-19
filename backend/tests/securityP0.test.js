// P0 资金与凭据类修复回归测试（node:test 集成测试）
// 覆盖本次安全整改的 4 个防线：
//   P0-A 凭据掩码：集成配置/外部调用方密钥经列表、详情、更新返回时一律掩码，仅创建回显明文
//   P0-B 容器越权：group 范围用户（operator）不得读取/覆盖其它小组订单的箱信息
//   P0-C 放单越权：group 范围用户不得对他组订单发起放单申请
//   P0-D 支付不误伤：all 范围财务用户仍可正常为他组订单创建支付交易
// 运行：node --test tests/securityP0.test.js（需先连上 PostgreSQL 测试库，并 npm install）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3052';
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
let adminToken, operatorToken, financeToken;
let isoGroupId; // 隔离小组：承载"他组订单"

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

describe('P0 资金与凭据类修复回归测试', () => {
  before(async () => {
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'inherit' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });
    // 消费 stdout 丢弃：不读子进程 stdout 会让 64KB 管道缓冲填满，拖死其 HTTP 响应线程
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env, stdio: 'pipe' });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();
    adminToken = await login('admin');
    operatorToken = await login('operator');
    financeToken = await login('finance');

    // 构造隔离小组并把他组订单（种子订单1）归属进去
    const g = await api('POST', '/api/groups', adminToken, { name: 'P0隔离组', code: 'p0_iso' });
    assert.equal(g.status, 200, `创建小组失败: ${g.text}`);
    isoGroupId = g.j.data.id;
    const { Order } = require('../src/models');
    await Order.update({ groupId: isoGroupId }, { where: { id: 1 } });

    // 给他组订单预置一条容器记录（模型直写，绕过客户端校验）
    const { OrderContainer } = require('../src/models');
    const c = await OrderContainer.create({ orderId: 1, containerNo: 'TESTU1234567', sealNo: 'SEAL001' });
    await api('DELETE', `/api/containers/${c.id}`, adminToken); // 清理探测用行
  });

  after(async () => {
    if (serverProc) { try { serverProc.kill('SIGTERM'); } catch { /* ignore */ } }
    try { const { sequelize } = require('../src/models'); await sequelize.close(); } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // P0-A 凭据掩码：仅创建回显明文，列表/详情/更新一律掩码
  // ---------------------------------------------------------------------------
  test('P0-A 集成配置密钥：创建回显明文，列表/详情/更新掩码', async () => {
    const SECRET = 'SECRET-KEY-ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890';
    const create = await api('POST', '/api/integrations', adminToken, {
      code: 'secmask_test', name: '掩码测试', authType: 'api_key', apiKey: SECRET, enabled: true,
    });
    assert.equal(create.status, 200, `集成配置创建失败: ${create.text}`);
    assert.equal(create.j.code, 0);
    assert.equal(create.j.data.apiKey, SECRET, '创建时应回显明文密钥供调用方留档');
    const id = create.j.data.id;

    // 列表（含 keyword 命中）不得含明文
    const list = await api('GET', '/api/integrations?keyword=掩码', adminToken);
    assert.equal(list.status, 200);
    const row = list.j.data.list.find((r) => r.id === id);
    assert.ok(row, '列表应包含新配置');
    assert.notEqual(row.apiKey, SECRET, '列表 apiKey 不得为明文');
    assert.match(row.apiKey || '', /\.\.\./, '列表 apiKey 应为掩码形态');

    // 详情掩码
    const get = await api('GET', `/api/integrations/${id}`, adminToken);
    assert.equal(get.status, 200);
    assert.notEqual(get.j.data.apiKey, SECRET, '详情 apiKey 不得为明文');

    // 更新掩码
    const upd = await api('PUT', `/api/integrations/${id}`, adminToken, { enabled: false });
    assert.equal(upd.status, 200);
    assert.notEqual(upd.j.data.apiKey, SECRET, '更新响应 apiKey 不得为明文');
  });

  // ---------------------------------------------------------------------------
  // P0-A2 外部调用方（clients）密钥掩码：创建回显明文，列表掩码
  // ---------------------------------------------------------------------------
  test('P0-A2 外部调用方密钥：创建回显明文，列表掩码', async () => {
    const SECRET = 'CLIENT-HMAC-KEY-0123456789-ABCDEF';
    const c = await api('POST', '/api/integrations/clients', adminToken, {
      code: 'p0_gw_client', name: 'P0网关', apiKey: SECRET, enabled: true,
    });
    assert.equal(c.status, 200, `客户端创建失败: ${c.text}`);
    assert.equal(c.j.data.apiKey, SECRET, '创建客户端应回显本次提交的明文密钥');

    const list = await api('GET', '/api/integrations/clients?q=p0_gw_client', adminToken);
    assert.equal(list.status, 200);
    const row = list.j.data.list.find((r) => r.code === 'p0_gw_client');
    assert.ok(row, '列表应包含新客户端');
    assert.notEqual(row.apiKey, SECRET, '列表 apiKey 不得为明文');
    assert.match(row.apiKey || '', /\.\.\./, '列表 apiKey 应为掩码');
  });

  // ---------------------------------------------------------------------------
  // P0-B 容器越权：operator(group) 不得读取/覆盖他组订单箱信息
  // ---------------------------------------------------------------------------
  test('P0-B 容器越权：operator 无法读取/保存他组订单的箱信息(404)', async () => {
    // 正控：admin(all) 可读取他组订单容器
    const adminList = await api('GET', '/api/orders/1/containers', adminToken);
    assert.equal(adminList.status, 200, 'admin 应可读取他组订单容器');
    assert.ok(Array.isArray(adminList.j.data), 'admin 容器列表应为数组');

    // 反控：operator(group) 读取他组订单容器 → 404 不可泄漏
    const opRead = await api('GET', '/api/orders/1/containers', operatorToken);
    assert.equal(opRead.status, 404, 'operator 读取他组容器应 404');

    // 反控：operator 覆盖写他组订单箱信息 → 404
    const opSave = await api('PUT', '/api/orders/1/containers', operatorToken, {
      items: [{ containerNo: 'TESTU1234567', sealNo: 'X' }],
    });
    assert.equal(opSave.status, 404, 'operator 覆盖写他组容器应 404');
  });

  // ---------------------------------------------------------------------------
  // P0-C 放单越权：operator(group) 不得对他组订单发起放单申请
  // ---------------------------------------------------------------------------
  test('P0-C 放单越权：operator 无法对他组订单发起放单申请(404)', async () => {
    // 正控：admin(all) 可对他组订单申请放单（应收未结清时进入审批，接口仍 200 code=0）
    const adminApply = await api('POST', '/api/orders/1/release', adminToken, { releaseType: 'original', releaseNo: 'R-P0-001' });
    assert.equal(adminApply.status, 200, `admin 申请放单应成功: ${adminApply.text}`);

    // 反控：operator(group) 对他组订单申请放单 → 404 不得泄漏
    const opApply = await api('POST', '/api/orders/1/release', operatorToken, { releaseType: 'original', releaseNo: 'R-P0-002' });
    assert.equal(opApply.status, 404, `operator 申请他组放单应 404, got=${opApply.status}`);
    assert.equal(opApply.j.code, 1, '业务码 1 表示“订单不存在或无权访问”');
  });

  // ---------------------------------------------------------------------------
  // P0-D 支付不误伤：all 范围财务仍可正常为他组订单创建支付交易
  // ---------------------------------------------------------------------------
  test('P0-D 支付正控：finance(all) 可正常为他组订单创建支付草稿', async () => {
    const create = await api('POST', '/api/payments', financeToken, {
      orderId: 1, amount: 88.5, currency: 'USD', type: 'outward',
      beneficiary: 'BENEF', beneficiaryBank: 'BBNK',
    });
    assert.equal(create.status, 200, `finance 创建支付应成功(不误伤): ${create.text}`);
    assert.equal(create.j.code, 0, 'finance 创建支付应返回 code 0');
    assert.equal(create.j.data.status, 'draft');
  });
});