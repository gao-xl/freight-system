// 汇率查询适配器（免费汇率 API: open.er-api.com）
const axios = require('axios');

const code = 'exchange_rate';

async function query(cfg, payload) {
  const url = `https://open.er-api.com/v6/latest/${payload.base || 'USD'}`;
  const resp = await axios.get(url, { timeout: 8000 });
  return resp.data;
}

async function send(cfg, payload) {
  return query(cfg, payload);
}

module.exports = { code, name: '汇率查询', send, query };