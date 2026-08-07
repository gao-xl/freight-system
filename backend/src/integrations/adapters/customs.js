// 海关系统对接适配器
// 负责报关单申报/放行状态查询。真实环境对接单一窗口或海关QP接口。
const axios = require('axios');

const code = 'customs';

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/${action}`;
  const headers = {};
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 8000 });
  return resp.data;
}

async function send(cfg, payload) {
  return call(cfg, payload, 'declare');
}

async function query(cfg, payload) {
  return call(cfg, payload, 'status');
}

module.exports = { code, name: '海关系统', send, query };