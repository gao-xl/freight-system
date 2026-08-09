// Onboarding 引导系统测试（Spec §5/§9 + 设计细化）
// 空库启动 → 自动迁移 → setup-admin 创建管理员 → 空态判定 → 示例数据生成(幂等) → 清空隔离 → health 不泄敏感 → defaults
// 运行：npm test（与 smoke.test.js 串行，独立端口 3060 + 独立空库）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const PORT = '3060';
const BASE = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'onboarding-test-secret-' + Math.random().toString(36).slice(2),
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

async function api(method, p, body, t) {
  const headers = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = `Bearer ${t}`;
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch { /* 非 JSON 响应 */ }
  return { status: r.status, body: j };
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Onboarding 引导系统', () => {
  before(async () => {
    // 空库启动：server.js 自动迁移 + sync + bootstrap（RBAC/基准汇率）→ setup-admin 创建管理员
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env });
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();

    const r = await fetch(`${BASE}/api/system/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123456', name: '测试管理员' }),
    });
    const raw = await r.text();
    assert.equal(r.status, 200, `setup-admin 应成功：${raw}`);
    const j = JSON.parse(raw);
    assert.equal(j.code, 0);
    token = j.data.token;
    assert.ok(token && token.length > 20, 'token 应为非空长串');
  });

  after(async () => {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  });

  test('未登录访问系统健康返回 401', async () => {
    const r = await api('GET', '/api/system/health');
    assert.equal(r.status, 401);
  });

  test('空态判定：全新系统各资源为 0 且公司未配置', async () => {
    const r = await api('GET', '/api/onboarding/status', null, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.deepEqual(r.body.data, {
      customers: 0, quotations: 0, orders: 0, bookings: 0, declarations: 0,
      financeRecords: 0, freightRates: 0, companyConfigured: false,
    });
  });

  test('生成示例数据：批次号 + 各表计数符合 3/3/2/1/1/4/1', async () => {
    const r = await api('POST', '/api/onboarding/demo-data', null, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    const { batchId, counts } = r.body.data;
    assert.match(batchId, /^demo-\d{8}-\d{6}-\d{3}$/, '批次号格式应为 demo-YYYYMMDD-HHmmss-xxx');
    assert.deepEqual(counts, {
      customers: 3, suppliers: 2, quotations: 3, orders: 2, bookings: 1,
      declarations: 1, financeRecords: 4, freightRates: 1,
    });
  });

  test('生成后空态判定反映真实数据（count 派生）', async () => {
    const r = await api('GET', '/api/onboarding/status', null, token);
    assert.equal(r.body.code, 0);
    const d = r.body.data;
    assert.equal(d.customers, 3);
    assert.equal(d.quotations, 3);
    assert.equal(d.orders, 2);
    assert.equal(d.bookings, 1);
    assert.equal(d.declarations, 1);
    assert.equal(d.financeRecords, 4);
    assert.equal(d.freightRates, 1);
  });

  test('幂等：重复生成先清后建，计数一致且批次更新', async () => {
    const r1 = await api('POST', '/api/onboarding/demo-data', null, token);
    const r2 = await api('POST', '/api/onboarding/demo-data', null, token);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.notEqual(r1.body.data.batchId, r2.body.data.batchId, '重复生成应产生新批次');
    assert.deepEqual(r2.body.data.counts, r1.body.data.counts, '计数应一致（先清后建）');
  });

  test('隔离：存在真实数据时拒绝生成（409），清空仅删演示数据', async () => {
    // 生成演示数据后创建真实客户
    const created = await api('POST', '/api/customers', { code: 'REAL-C-001', name: '真实客户测试', type: 'exporter', phone: '13900000000' }, token);
    assert.equal(created.status, 200, `创建真实客户应成功：${JSON.stringify(created.body)}`);
    assert.equal(created.body.code, 0);
    const realId = created.body.data.id;
    assert.ok(realId, '真实客户应返回 id');

    // 任意表已有真实数据 → 拒绝生成
    const blocked = await api('POST', '/api/onboarding/demo-data', null, token);
    assert.equal(blocked.status, 409, '已有真实数据应拒绝生成');

    // 清空仅删 isDemo 记录，真实客户不受影响
    const cleared = await api('DELETE', '/api/onboarding/demo-data', null, token);
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.code, 0);
    assert.ok(Number(cleared.body.data.deleted) > 0, '应返回删除条数');

    const after = await api('GET', '/api/onboarding/status', null, token);
    assert.equal(after.body.data.customers, 1, '真实客户应保留');
    assert.equal(after.body.data.quotations, 0);
    assert.equal(after.body.data.orders, 0);
    assert.equal(after.body.data.bookings, 0);
    assert.equal(after.body.data.declarations, 0);
    assert.equal(after.body.data.financeRecords, 0);
    assert.equal(after.body.data.freightRates, 0);

    // 真实客户仍可通过详情读取
    const real = await api('GET', `/api/customers/${realId}`, null, token);
    assert.equal(real.status, 200, '真实客户详情应可读');
    assert.equal(real.body.data.name, '真实客户测试');
  });

  test('系统健康检查：六项三态 + 不泄露敏感路径', async () => {
    const r = await api('GET', '/api/system/health', null, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    const { checks, summary } = r.body.data;
    assert.ok(Array.isArray(checks) && checks.length >= 6, '应包含 6 项检查');
    assert.ok(['ok', 'warn', 'fail'].includes(summary), 'summary 应为三态之一');
    const items = checks.map((c) => c.item);
    for (const need of ['node', 'disk', 'port', 'dataDir', 'db', 'migration']) {
      assert.ok(items.includes(need), `应包含检查项 ${need}`);
    }
    for (const c of checks) {
      assert.ok(['ok', 'warn', 'fail'].includes(c.status), `检查项 ${c.item} status 应为三态`);
      assert.ok(typeof c.detail === 'string' && c.detail.length > 0, `检查项 ${c.item} 应有人类可读 detail`);
      // 不泄露敏感路径：detail/fix 不含绝对路径特征（盘符、反斜杠路径、db 文件名）
      const text = `${c.detail || ''} ${c.fix || ''}`;
      assert.ok(!/[A-Za-z]:[\\/]/.test(text), `${c.item} 不应含盘符绝对路径：${text}`);
      assert.ok(!text.includes('\\'), `${c.item} detail/fix 不应含反斜杠路径`);
      assert.ok(!text.includes('.db'), `${c.item} 不应泄露数据库文件名`);
    }
  });

  test('默认设置读写：默认 CNY，可更新且校验三位大写币种', async () => {
    const initial = await api('GET', '/api/system/defaults', null, token);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.data.defaultCurrency, 'CNY', '默认币种应为 CNY');

    const updated = await api('PUT', '/api/system/defaults', { defaultCurrency: 'USD' }, token);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.defaultCurrency, 'USD');

    // 小写自动归一为大写
    const lower = await api('PUT', '/api/system/defaults', { defaultCurrency: 'eur' }, token);
    assert.equal(lower.status, 200);
    assert.equal(lower.body.data.defaultCurrency, 'EUR');

    // 非法格式拒绝
    const bad1 = await api('PUT', '/api/system/defaults', { defaultCurrency: 'CN' }, token);
    assert.equal(bad1.status, 400);
    const bad2 = await api('PUT', '/api/system/defaults', { defaultCurrency: 'US Dollar' }, token);
    assert.equal(bad2.status, 400);

    const after = await api('GET', '/api/system/defaults', null, token);
    assert.equal(after.body.data.defaultCurrency, 'EUR');
  });

  test('向导完成标记：接口预留恒成功', async () => {
    const r = await api('POST', '/api/onboarding/wizard/done', {}, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.equal(r.body.data.ok, true);
  });

  test('旧路径兼容别名：/api/system/demo-data 仍可用', async () => {
    // 此时表内有 1 条真实客户，生成应 409（兼容别名同样受表空校验约束）
    const r = await api('POST', '/api/system/demo-data', null, token);
    assert.equal(r.status, 409, '兼容别名应同样拒绝生成');
  });
});
