// 运价（Ocean/Air Freight Rate）数据对接适配器
// 对接运价平台/货代同行的运价接口。未启用时返回模拟运价。
const axios = require('axios');
const crypto = require('crypto');

const code = 'freight_rate';

function sign(cfg, payload) {
  const secret = cfg.secret || cfg.apiKey || 'demo-secret';
  const raw = JSON.stringify(payload) + secret;
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/rate/${action}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Client': cfg.clientCode || '',
    'X-Sign': sign(cfg, payload),
    'X-Timestamp': Date.now(),
  };
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 15000 });
  return resp.data;
}

async function query(cfg, payload) {
  if (!cfg.enabled) return mockRate(payload);
  return call(cfg, payload, 'query');
}

async function send(cfg, payload) {
  throw new Error('运价接口仅支持查询');
}

function mockRate(payload) {
  const { from, to, containerType } = payload || {};
  return {
    ok: true,
    simulated: true,
    message: '运价平台未启用，返回模拟运价',
    from, to, containerType,
    rates: [
      { carrier: 'COSCO', price: 1650, currency: 'USD', validUntil: '2099-12-31', transitDays: 18 },
      { carrier: 'MAERSK', price: 1720, currency: 'USD', validUntil: '2099-12-31', transitDays: 17 },
      { carrier: 'OOCL', price: 1580, currency: 'USD', validUntil: '2099-12-31', transitDays: 20 },
    ],
    time: new Date().toISOString(),
  };
}

module.exports = { code, name: '运价平台', send, query };