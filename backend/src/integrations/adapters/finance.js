// 财务/ERP系统对接适配器
// 负责应收应付、开票、对账等财务数据同步。真实环境对接金蝶/用友/资金系统。
const axios = require('axios');

const code = 'finance';

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/${action}`;
  const headers = {};
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: 8000 });
  return resp.data;
}

async function send(cfg, payload) {
  return call(cfg, payload, 'voucher');
}

async function query(cfg, payload) {
  return call(cfg, payload, 'statement');
}

module.exports = { code, name: '财务系统', send, query };