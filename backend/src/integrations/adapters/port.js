// 港口系统对接适配器
// 负责船舶到港/离港、码头装卸、集装箱在场状态等港口数据的同步。
// 真实环境中应替换为对港口EDI/API网关的 HTTP 调用。
const axios = require('axios');

const code = 'port';

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/${action}`;
  const headers = {};
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 8000 });
  return resp.data;
}

async function send(cfg, payload) {
  return call(cfg, payload, 'report');
}

async function query(cfg, payload) {
  return call(cfg, payload, 'query');
}

module.exports = { code, name: '港口系统', send, query };