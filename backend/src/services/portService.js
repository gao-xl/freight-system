// C1 港口官方平台统一服务：按港口路由到对应适配器
const { IntegrationClient } = require('../integrations');

// 港口 → 适配器编码映射
const PORT_CODE = {
  qingdao: 'port_qingdao',
  shanghai: 'port_shanghai',
  ningbo: 'port_ningbo',
  dsz: 'port_ningbo', // 宁波舟山简称
};

// 解析港口名（支持中英文/别名）
function resolvePort(port) {
  const p = String(port || '').toLowerCase();
  if (p.includes('qingdao') || p.includes('青岛')) return 'port_qingdao';
  if (p.includes('shanghai') || p.includes('上海') || p.includes('洋山') || p.includes('外高桥')) return 'port_shanghai';
  if (p.includes('ningbo') || p.includes('zhoushan') || p.includes('宁波') || p.includes('舟山')) return 'port_ningbo';
  return null;
}

// 查询船舶/箱状态：{ port?, vesselName?, mmsi?, containerNo?, billNo? }
async function queryPort(payload) {
  const code = resolvePort(payload.port) || payload.portCode || PORT_CODE[payload.port] || 'port_qingdao';
  const client = await IntegrationClient.get(code);
  try {
    return await client.query(payload);
  } catch (e) {
    // 未启用对接时返回模拟数据，便于演示与联调
    if (e && /未启用|not enabled/i.test(e.message)) {
      return {
        code: 'demo',
        message: `${code} 对接未启用，返回模拟数据`,
        payload,
        vesselStatus: 'ARRIVED',
        containerStatus: payload.containerNo ? 'IN_YARD' : null,
        gateStatus: 'OPEN',
        time: new Date().toISOString(),
      };
    }
    throw e;
  }
}

// 上报（如靠泊/装卸事件）
async function reportPort(payload) {
  const code = resolvePort(payload.port) || payload.portCode || PORT_CODE[payload.port] || 'port_qingdao';
  const client = await IntegrationClient.get(code);
  try {
    return await client.send(payload);
  } catch (e) {
    if (e && /未启用|not enabled/i.test(e.message)) {
      return { code: 'demo', message: `${code} 对接未启用，模拟上报成功`, payload, time: new Date().toISOString() };
    }
    throw e;
  }
}

// 可用港口列表
const SUPPORTED_PORTS = [
  { code: 'qingdao', name: '青岛港', adapter: 'port_qingdao' },
  { code: 'shanghai', name: '上海港', adapter: 'port_shanghai' },
  { code: 'ningbo', name: '宁波舟山港', adapter: 'port_ningbo' },
];

module.exports = { queryPort, reportPort, resolvePort, SUPPORTED_PORTS };