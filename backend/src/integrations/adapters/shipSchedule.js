// 船期查询适配器（SeaRates/搜航网等）
const axios = require('axios');

const code = 'ship_schedule';

async function query(cfg, payload) {
  const url = `${cfg.baseUrl || ''}/api/schedule`;
  const resp = await axios.post(url, payload, {
    headers: { 'X-API-Key': cfg.apiKey || '' },
    timeout: 8000,
  });
  return resp.data;
}

async function send(cfg, payload) {
  return query(cfg, payload);
}

module.exports = { code, name: '船期查询', send, query };