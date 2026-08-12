// 安全修复回归测试（node:test 集成测试）
// 覆盖本次安全整改的 4 个关键防线，防止问题回归：
//   H-01 跨组打印越权：group 范围用户不得经打印接口读取他组订单数据
//   L-02/L-03 低权限写自定义字段：只读用户（无 order:update）不得改写订单自定义字段值
//   M-04 最后一名管理员保护：唯一管理员不可被降权/删除
//   L-06 角色变更旧 token 失效：角色/数据范围变更后旧 token 立即失效
// 运行：npm test（需先连上 PostgreSQL，并 npm install）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
// 加载测试环境变量（TEST_DB_* 等），与 smoke.test.js 的测试库约定保持一致
require('dotenv').config({ path: path.join(BACKEND, '.env.test') });
const PORT = '3051';
const BASE = `http://localhost:${PORT}`;

// 测试库连接参数（与 smoke.test.js 一致；生产方言为 PostgreSQL）
const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-do-not-use-in-prod-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};

// 让本测试进程复用同一套库连接（H-01 需直接落库把订单归属到指定小组做隔离场景）
for (const k of ['DB_DIALECT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  process.env[k] = env[k];
}

let serverProc;
let serverStderr = '';
let adminToken, operatorToken, financeToken;

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

async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const j = await r.json();
  assert.equal(j.code, 0, `登录失败 ${username}: ${j.message}`);
  return j.data.token;
}

const authH = (t) => ({ Authorization: `Bearer ${t}` });

// 统一请求助手：返回 { status, text, j }（j 为 JSON 解析结果，可能为 null）
async function api(method, p, token, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? authH(token) : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* 非 JSON（如打印 HTML/PDF） */ }
  return { status: r.status, text, j };
}

describe('安全修复回归测试', () => {
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
    adminToken = await login('admin');
    operatorToken = await login('operator');
    financeToken = await login('finance');
  });

  after(async () => {
    if (serverProc) { try { serverProc.kill('SIGTERM'); } catch { /* ignore */ } }
    // 关闭本测试进程单独建立的 sequelize 连接，避免进程挂起
    try {
      const { sequelize } = require('../src/models');
      await sequelize.close();
    } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // H-01 跨组打印越权：group 范围用户经打印接口读取他组订单 → 数据不得泄漏
  // ---------------------------------------------------------------------------
  test('H-01 跨组打印越权：group 用户无法经打印渲染读取他组订单数据', async () => {
    // 1) 管理员创建独立小组（用于承载一张"他组"订单）
    const g = await api('POST', '/api/groups', adminToken, { name: '越权隔离测试组', code: 'sec_iso' });
    assert.equal(g.status, 200, `创建小组失败: ${g.text}`);
    assert.equal(g.j.code, 0);
    const grpId = g.j.data.id;

    // 2) 创建一张专用打印模板：仅渲染 order.orderNo（符合当前渲染引擎 schema，
    //    避免依赖默认模板 legacy 结构，保证断言确定）
    const tpl = await api('POST', '/api/print-templates', adminToken, {
      name: '回归-跨组隔离',
      docType: 'bl',
      isDefault: false,
      content: JSON.stringify({
        blocks: [{
          type: 'fields',
          columns: 2,
          fields: [{ key: 'order.orderNo', label: '订单号', show: true, type: 'text' }],
        }],
      }),
    });
    assert.equal(tpl.status, 200, `创建打印模板失败: ${tpl.text}`);
    assert.equal(tpl.j.code, 0);
    const tplId = tpl.j.data.id;

    // 3) 直接落库：把种子订单1归属到该小组。
    //    groupId 属服务端数据范围字段，客户端校验会剥离，故此处经模型直写以构造真实隔离场景。
    const { Order } = require('../src/models');
    await Order.update({ groupId: grpId }, { where: { id: 1 } });

    // 4) 正控：admin(dataScope=all) 可读取该订单打印数据
    const adminPrint = await api('GET', `/api/print/bl/1?format=html&template=${tplId}`, adminToken);
    assert.equal(adminPrint.status, 200, 'admin 打印应返回 200');
    assert.ok(adminPrint.text.includes('SO20260801001'), 'admin 应能打印出该订单单号');

    // 5) 反控：operator(dataScope=group，未加入该组) 打印同一订单 → 不得泄漏订单单号
    const opPrint = await api('GET', `/api/print/bl/1?format=html&template=${tplId}`, operatorToken);
    assert.equal(opPrint.status, 200, '跨组操作打印应返回 200（空数据）而非泄漏');
    assert.ok(!opPrint.text.includes('SO20260801001'), '跨组操作的打印 HTML 不应包含他组订单单号');
  });

  // ---------------------------------------------------------------------------
  // L-02/L-03 低权限写自定义字段：只读用户（finance 无 order:update）不得改写
  // ---------------------------------------------------------------------------
  test('L-02/L-03 低权限写自定义字段：只读用户改写订单自定义字段被拒(403)', async () => {
    // finance 角色仅 order:read，无 order:update
    const read = await api('GET', '/api/orders/1/custom-fields', financeToken);
    assert.equal(read.status, 200, '只读用户应可读取订单自定义字段');

    const write = await api('PUT', '/api/orders/1/custom-fields', financeToken, { values: { secret: 'x' } });
    assert.equal(write.status, 403, '只读用户写订单自定义字段应返回 403');
    assert.equal(write.j.code, 403);
  });

  // ---------------------------------------------------------------------------
  // M-04 最后一名管理员保护：唯一管理员不可被降权/删除
  // ---------------------------------------------------------------------------
  test('M-04 最后一名管理员保护：唯一管理员不可降权或删除', async () => {
    // 解析 admin 用户 id（seed 中默认 id=1，仍经接口解析以防漂移）
    const users = await api('GET', '/api/users', adminToken);
    assert.equal(users.status, 200);
    const adminUser = users.j.data.find((u) => u.username === 'admin');
    assert.ok(adminUser, '应存在 admin 用户');
    const adminId = adminUser.id;

    // 唯一管理员降权自己 → 400（系统至少需保留一名管理员）
    const demote = await api('PUT', `/api/users/${adminId}`, adminToken, { role: 'operator' });
    assert.equal(demote.status, 400, '唯一管理员降权自身应被拒绝');
    assert.match(demote.j.message || '', /管理员/);

    // 删除自己 → 400（内置管理员不可删除）
    const remove = await api('DELETE', `/api/users/${adminId}`, adminToken);
    assert.equal(remove.status, 400, '删除内置 admin 应被拒绝');
  });

  // ---------------------------------------------------------------------------
  // L-06 角色变更旧 token 失效：角色数据范围变更后旧 token 立即失效
  // ---------------------------------------------------------------------------
  test('L-06 角色变更旧 token 失效：数据范围变更后旧 token 立即失效(401)', async () => {
    // baseline：operator 旧 token 当前有效
    const before = await api('GET', '/api/orders', operatorToken);
    assert.equal(before.status, 200, '变更前 operator 旧 token 应有效');

    // 解析 operator 角色 id
    const roles = await api('GET', '/api/roles', adminToken);
    assert.equal(roles.status, 200);
    const opRole = roles.j.data.find((r) => r.code === 'operator');
    assert.ok(opRole, '应存在 operator 角色');
    const opRoleId = opRole.id;

    // 管理员变更 operator 角色数据范围（触发 tokenVersion 递增 + 会话失效）
    const upd = await api('PUT', `/api/roles/${opRoleId}`, adminToken, { dataScope: 'self' });
    assert.equal(upd.status, 200, `角色数据范围变更失败: ${upd.text}`);
    assert.equal(upd.j.code, 0);

    // 变更后：operator 旧 token 必须失效
    const after = await api('GET', '/api/orders', operatorToken);
    assert.equal(after.status, 401, '角色数据范围变更后，旧 token 应返回 401');

    // 重新登录后新 token 可用
    const newToken = await login('operator');
    const relogin = await api('GET', '/api/orders', newToken);
    assert.equal(relogin.status, 200, '重新登录后新 token 应可用');
  });
});