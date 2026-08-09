// E3 客户门户增强测试
// 覆盖：客户自助下载账单/提单 PDF（含 PDF 魔数）、在线补料（SI）提交且操作员可见、
//      非本客户订单 404 隔离、运价查询 200、未登录 401、空 SI 校验 400。
// 运行：npm test（与 smoke/pdf/onboarding/tracking-auto 串行；独立端口 3070 + 独立空库）
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const PORT = '3070';
const BASE = `http://localhost:${PORT}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'portal-enhanced-test-secret-' + Math.random().toString(36).slice(2),
  DB_DIALECT: 'postgres',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '5432',
  DB_NAME: process.env.TEST_DB_NAME || 'freight_test',
  DB_USER: process.env.TEST_DB_USER || 'freight',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  PORT,
  PORT_SVC_URL: '', CUSTOMS_SVC_URL: '', FINANCE_SVC_URL: '',
};

let serverProc;
let serverStderr = '';
let adminToken;
let customerToken;
let operatorToken;
let invoiceId;

async function waitForHealth(timeoutMs = 60000) {
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
  assert.equal(r.status, 200, `登录 ${username} 应成功：${JSON.stringify(j)}`);
  assert.equal(j.code, 0);
  return j.data.token;
}

const authH = (t) => ({ Authorization: `Bearer ${t}` });

// PDF 渲染（puppeteer）单次可达 10-30s，兜底 120s 超时，避免渲染卡住时 fetch 无限挂起
const PDF_TIMEOUT_MS = 120000;
async function pdfFetch(url, token) {
  return fetch(url, { headers: authH(token), signal: AbortSignal.timeout(PDF_TIMEOUT_MS) });
}

describe('客户门户增强（E3）', () => {
  before(async () => {
    // 1. 种子数据（demo：客户 1-5、订单 1-5、单证、财务）
    await new Promise((resolve, reject) => {
      const s = spawn(process.execPath, ['src/seed.js'], { cwd: BACKEND, env, stdio: 'ignore' });
      s.on('close', (code) => (code === 0 ? resolve() : reject(new Error('seed 失败 code=' + code))));
    });

    // 2. 启动后端
    serverProc = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env });
    serverProc.stderr.on('data', (d) => { serverStderr += d.toString(); });
    await waitForHealth();

    adminToken = await login('admin');
    operatorToken = await login('operator');

    // 3. 创建客户门户账号（customer 角色，关联客户档案 1）
    const u = await fetch(`${BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(adminToken) },
      body: JSON.stringify({ username: 'portal_cust', name: '门户客户', password: '123456', role: 'customer', customerId: 1 }),
    });
    const uj = await u.json();
    assert.equal(u.status, 200, `创建客户账号应成功：${JSON.stringify(uj)}`);
    assert.equal(uj.code, 0);
    customerToken = await login('portal_cust');

    // 4. 给订单 1（客户 1）建一张应收发票，供下载账单测试
    const inv = await fetch(`${BASE}/api/finance/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(adminToken) },
      body: JSON.stringify({ invoiceType: 'receivable', orderId: 1, amount: 1000, currency: 'USD' }),
    });
    const invj = await inv.json();
    assert.equal(inv.status, 200, `创建发票应成功：${JSON.stringify(invj)}`);
    assert.equal(invj.code, 0);
    invoiceId = invj.data.id;
    assert.ok(invoiceId, '发票应返回 id');

    // 5. 建一条运价（上海港-鹿特丹 40HQ），供运价查询测试
    const rate = await fetch(`${BASE}/api/freight-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(adminToken) },
      body: JSON.stringify({ originPort: '上海港', destPort: '鹿特丹', containerType: '40HQ', rate: 1000, currency: 'USD', validFrom: '2026-01-01', validTo: '2026-12-31' }),
    });
    const ratej = await rate.json();
    assert.equal(rate.status, 200, `创建运价应成功：${JSON.stringify(ratej)}`);
    assert.equal(ratej.code, 0);
  });

  after(async () => {
    if (serverProc) {
      try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  });

  test('未登录访问门户增强接口返回 401', async () => {
    const r1 = await fetch(`${BASE}/api/portal/rates`);
    assert.equal(r1.status, 401);
    const r2 = await fetch(`${BASE}/api/portal/orders/1/si`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r2.status, 401);
  });

  test('下载账单 PDF：200 + Content-Type pdf + PDF 魔数', async () => {
    const r = await pdfFetch(`${BASE}/api/portal/orders/1/invoices/${invoiceId}/download`, customerToken);
    assert.equal(r.status, 200, `下载账单应 200：server stderr:\n${serverStderr.slice(-800)}`);
    assert.match(r.headers.get('content-type') || '', /application\/pdf/i);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.length > 100, 'PDF 应非空');
    assert.equal(buf.slice(0, 4).toString('latin1'), '%PDF', '应以 PDF 魔数 %PDF 开头');
  });

  test('下载账单 PDF（应收费用行）：FinanceRecord id → 费用通知单 PDF', async () => {
    // 前端按费用行下载：传入 FinanceRecord id（订单 1 应收行 id=1）
    const r = await pdfFetch(`${BASE}/api/portal/orders/1/invoices/1/download`, customerToken);
    assert.equal(r.status, 200, `按费用行下载账单应 200：server stderr:\n${serverStderr.slice(-800)}`);
    assert.match(r.headers.get('content-type') || '', /application\/pdf/i);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString('latin1'), '%PDF', '应以 PDF 魔数 %PDF 开头');
  });

  test('下载提单 PDF：200 + Content-Disposition attachment + PDF 魔数', async () => {
    const r = await pdfFetch(`${BASE}/api/portal/orders/1/documents/1/download`, customerToken);
    assert.equal(r.status, 200, `下载提单应 200：server stderr:\n${serverStderr.slice(-800)}`);
    assert.match(r.headers.get('content-type') || '', /application\/pdf/i);
    assert.match(r.headers.get('content-disposition') || '', /attachment/i);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString('latin1'), '%PDF', '应以 PDF 魔数 %PDF 开头');
  });

  test('SI 补料提交成功：写入订单且操作员可见（契约字段 shipper/consignee）', async () => {
    const si = {
      shipper: '华茂国际贸易有限公司\n上海市浦东新区世纪大道100号',
      consignee: 'EURO TRADING BV\nROTTERDAM',
      notifyParty: 'SAME AS CONSIGNEE',
      marksNumbers: 'HM2026 / ROTTERDAM / C/NO.1-420',
      cargoDesc: '纺织服装',
      remark: '请按此补料制单',
    };
    const r = await fetch(`${BASE}/api/portal/orders/1/si`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(customerToken) },
      body: JSON.stringify(si),
    });
    const j = await r.json();
    assert.equal(r.status, 200, `SI 提交应 200：${JSON.stringify(j)}`);
    assert.equal(j.code, 0);
    assert.equal(j.data.siStatus, 'submitted', '补料状态应为 submitted');
    assert.equal(j.data.applied.shipperName, si.shipper, 'shipper 应写入订单 shipperName');

    // 操作员可见：订单详情携带补料状态与补料原文
    const od = await fetch(`${BASE}/api/orders/1`, { headers: authH(operatorToken) });
    assert.equal(od.status, 200);
    const odj = await od.json();
    assert.equal(odj.data.siStatus, 'submitted', '操作员应看到 siStatus=submitted');
    assert.equal(odj.data.shipperName, si.shipper, '提单发货人字段应被补料更新');
    assert.equal(odj.data.consigneeName, si.consignee, '提单收货人字段应被补料更新');
    const raw = JSON.parse(odj.data.siData);
    assert.equal(raw.marksNumbers, si.marksNumbers, '补料原文应含提交的唛头');
    assert.ok(odj.data.siSubmittedAt, '应记录补料提交时间');
    assert.equal(odj.data.siSubmittedByName, '门户客户', '应记录补料提交人');
  });

  test('SI 空提交被校验拒绝（400）', async () => {
    const r = await fetch(`${BASE}/api/portal/orders/1/si`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(customerToken) },
      body: '{}',
    });
    assert.equal(r.status, 400, '空补料应被拒绝');
  });

  test('非本客户订单隔离：SI/账单/提单一律 404', async () => {
    // 订单 2 属于客户 2，客户 1 的账号无权访问
    const si = await fetch(`${BASE}/api/portal/orders/2/si`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH(customerToken) },
      body: JSON.stringify({ shipperName: '越权尝试' }),
    });
    assert.equal(si.status, 404, '非本客户订单 SI 应 404');

    const inv = await fetch(`${BASE}/api/portal/orders/2/invoices/${invoiceId}/download`, { headers: authH(customerToken) });
    assert.equal(inv.status, 404, '非本客户订单账单应 404');

    const doc = await fetch(`${BASE}/api/portal/orders/2/documents/1/download`, { headers: authH(customerToken) });
    assert.equal(doc.status, 404, '非本客户订单提单应 404');
  });

  test('运价查询：from/to 精确 + keyword 模糊，非法箱型 400', async () => {
    const r = await fetch(`${BASE}/api/portal/rates?from=上海港&to=鹿特丹`, { headers: authH(customerToken) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.code, 0);
    assert.ok(Array.isArray(j.data.list), 'data.list 应为数组');
    assert.ok(j.data.list.some((x) => x.originPort === '上海港' && x.destPort === '鹿特丹'), '应命中新建运价');
    assert.equal(Number(j.data.list[0].rate), 1000);

    const kw = await fetch(`${BASE}/api/portal/rates?keyword=鹿特丹`, { headers: authH(customerToken) });
    assert.equal(kw.status, 200);
    const kwj = await kw.json();
    assert.ok(kwj.data.list.length >= 1, 'keyword 模糊应命中');

    const bad = await fetch(`${BASE}/api/portal/rates?containerType=XXL`, { headers: authH(customerToken) });
    assert.equal(bad.status, 400, '非法箱型应 400');
  });
});
