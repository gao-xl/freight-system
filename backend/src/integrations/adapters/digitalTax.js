// 数电发票（电子发票服务平台）对接适配器
// 负责已开票发票的推送/红冲/查询。真实环境对接国家税务总局电子发票服务平台开票接口。
// 经 IntegrationGateway 统一鉴权/限流/重试/留痕；适配器仅负责路径与报文构造。
const axios = require('axios');

const code = 'digitalTax';

async function call(cfg, payload, action) {
  const url = `${cfg.baseUrl || ''}/api/etax/${action}`;
  const headers = { ...(cfg.gatewayHeaders || {}) };
  if (!headers['X-API-Key'] && cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  const resp = await axios.post(url, payload, { headers, timeout: cfg.gatewayTimeout || 10000 });
  return resp.data;
}

// 推送发票开具/红冲请求
async function send(cfg, payload) {
  if (payload.invoiceType === 'payable' && payload.action === 'red') {
    return call(cfg, payload, 'red-return');
  }
  return call(cfg, payload, 'issue');
}

// 查询发票开具状态结果
async function query(cfg, payload) {
  return call(cfg, payload, 'query');
}

module.exports = { code, name: '数电发票平台', send, query };