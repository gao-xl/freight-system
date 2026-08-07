// 青岛港场站状态查询适配器
// 设计：按场站 mode 分发到 官方API / 授权抓取 / 人工录入。
// 真实环境需替换为对场站/港方网关的 HTTP 调用。未启用对接时返回空并提示。
const axios = require('axios');
const crypto = require('crypto');

const code = 'yard_qingdao';

// 各场站统一状态映射：在场/放行/集港/查验/提取
const STATUS_MAP = {
  IN_YARD: '在场',
  RELEASED: '放行',
  GATHERED: '集港',
  INSPECTING: '查验',
  PICKED_UP: '提取',
};

function mapStatus(s) {
  if (!s) return '在场';
  if (STATUS_MAP[s]) return STATUS_MAP[s];
  const hit = Object.keys(STATUS_MAP).find((k) => String(s).toUpperCase().includes(k));
  return hit ? STATUS_MAP[hit] : String(s);
}

function urlFor(cfg, yardCode) {
  // 官方对接场站统一走港方网关；可按场站拆分
  return `${cfg.baseUrl || ''}/yard/${yardCode}/status`;
}

function sign(cfg, payload) {
  const secret = cfg.secret || cfg.apiKey || '';
  const raw = JSON.stringify(payload) + secret;
  return crypto.createHmac('sha256', secret || 'demo-secret').update(raw).digest('hex');
}

// 将各场站异构返回统一为系统标准字段
function normalize(raw) {
  return {
    containerNo: raw.containerNo,
    billNo: raw.billNo,
    yardCode: raw.yardCode,
    yardName: raw.yardName,
    status: mapStatus(raw.status),
    location: raw.location,
    eventTime: raw.eventTime ? new Date(raw.eventTime) : null,
  };
}

async function query(cfg, payload) {
  const { containerNo, billNo, yardCode } = payload || {};
  if (!containerNo && !billNo) throw new Error('缺少箱号或提单号');
  const url = urlFor(cfg, yardCode || cfg.yardCode || 'evergreen');
  const headers = {
    'Content-Type': 'application/json',
    'X-Enterprise': cfg.enterpriseCode || '',
    'X-Sign': sign(cfg, { containerNo, billNo }),
    'X-Timestamp': Date.now(),
  };
  const resp = await axios.post(url, { containerNo, billNo }, { headers, timeout: 15000 });
  return normalize(resp.data);
}

async function send(cfg, payload) {
  // 场站仅支持查询
  throw new Error('场站仅支持查询');
}

module.exports = { code, name: '青岛港场站', send, query, STATUS_MAP };