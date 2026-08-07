// 美元支付通道对接适配器（融易达/银行直连）
// 负责美元汇出的下单、查询、回调确认。未启用时返回模拟结果。
const axios = require('axios');
const crypto = require('crypto');

const code = 'usd_pay';

function sign(cfg, payload) {
  const secret = cfg.secret || cfg.apiKey || 'demo-secret';
  const raw = JSON.stringify(payload) + secret;
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/pay/${action}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Merchant': cfg.merchantCode || '',
    'X-Sign': sign(cfg, payload),
    'X-Timestamp': Date.now(),
  };
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 20000 });
  return resp.data;
}

async function send(cfg, payload) {
  if (!cfg || !cfg.enabled) return mockPay(payload);
  return call(cfg, payload, 'create');
}

async function query(cfg, payload) {
  if (!cfg || !cfg.enabled) return { ok: true, simulated: true, status: 'success', externalRef: payload.externalRef };
  return call(cfg, payload, 'query');
}

function mockPay(payload) {
  return {
    ok: true,
    simulated: true,
    message: '美元支付通道未启用，返回模拟成功',
    externalRef: `DEMO${Date.now().toString().slice(-10)}`,
    status: 'success',
    amount: payload.amount,
    currency: payload.currency || 'USD',
    time: new Date().toISOString(),
  };
}

module.exports = { code, name: '美元支付通道', send, query };