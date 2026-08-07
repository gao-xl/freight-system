// AIS 船舶追踪适配器（AISHub 免费服务）
// 实时船位查询，按 MMSI。免费额度受限，需缓存。
const axios = require('axios');

const code = 'ais_tracking';

async function query(cfg, payload) {
  const url = cfg.baseUrl || 'https://data.aishub.net/ws/1.1/getdata.php';
  const resp = await axios.get(url, {
    params: { username: cfg.apiKey || cfg.username, format: 1, mmsi: payload.mmsi },
    timeout: 8000,
  });
  const data = resp.data || {};
  const rows = (data.STATUS === 'OK' && data.DATA) ? data.DATA : [];
  return { mmsi: payload.mmsi, rows };
}

async function send(cfg, payload) {
  throw new Error('AIS 只支持查询');
}

module.exports = { code, name: 'AIS 船舶追踪', send, query };