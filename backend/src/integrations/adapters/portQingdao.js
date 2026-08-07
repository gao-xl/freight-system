// 青岛港(Qingdao Port)官方平台对接适配器
// 覆盖船舶到离港、码头装卸、集装箱在场状态、闸口数据。
// 真实环境替换为对青岛港EDI/口岸数据交换平台的 HTTP 调用；未启用时返回 mock。
const axios = require('axios');
const crypto = require('crypto');

const code = 'port_qingdao';

function sign(cfg, payload) {
  const secret = cfg.secret || cfg.apiKey || 'demo-secret';
  const raw = JSON.stringify(payload) + secret;
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/qingdao/api/${action}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Enterprise': cfg.enterpriseCode || '',
    'X-Sign': sign(cfg, payload),
    'X-Timestamp': Date.now(),
  };
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 15000 });
  return resp.data;
}

async function send(cfg, payload) {
  if (!cfg || !cfg.enabled) return mockResult('send', payload);
  return call(cfg, payload, 'report');
}

async function query(cfg, payload) {
  if (!cfg || !cfg.enabled) return mockResult('query', payload);
  return call(cfg, payload, 'query');
}

function mockResult(action, payload) {
  return {
    code: 'demo',
    message: '青岛港对接未启用，返回模拟数据',
    action,
    payload,
    vesselStatus: 'ARRIVED',
    containerStatus: payload.containerNo ? 'IN_YARD' : null,
    gateStatus: 'OPEN',
    time: new Date().toISOString(),
  };
}

module.exports = { code, name: '青岛港官方平台', send, query };