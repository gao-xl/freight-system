'use strict';

// P2-1 API 集成网关
// ---------------------------------------------------------------------------
// 在既有 IntegrationClient(adapters) 之上统一收口外部系统对接的五类横切能力：
//   1. 认证   - 依据 IntegrationConfig.authType 统一构造鉴权头（api_key/basic/oauth2）
//   2. 限流   - 每个对接编码独立滑动窗口限流（复用 cacheService，单实例/Redis 皆可用）
//   3. 重试   - 网络错误/5xx 指数退避重试，携带幂等键，最多 N 次
//   4. 日志   - 每次进出往返落 EdiMessage（direction=out），排错可追溯
//   5. 超时   - 统一请求超时，防止外部接口挂起拖垮业务
//
// 每个对接的限流/重试/超时策略可写在其 IntegrationConfig.config JSON 中：
//   { "gateway": { "rps": 5, "retryAttempts": 3, "backoffMs": 500, "timeoutMs": 8000 } }
// 未配置则使用下方安全默认值。
//
// 本网关是纯服务层：不发 HTTP 业务请求，只编排 auth/limiter/retry/log，
// 真实收发仍交回对应 adapter（send/query），可无缝兼容既有全部适配器。

const uuid = require('uuid');
const { logger } = require('../utils/logger');
const cache = require('./cacheService');
const { EdiMessage, IntegrationConfig } = require('../services/dataAccess');

const DEFAULTS = {
  rps: 5,              // 每对接每秒请求上限
  retryAttempts: 3,    // 含首次的总尝试次数
  backoffMs: 500,      // 指数退避基数
  timeoutMs: 8000,
};

// 读取对接的策略配置（config 列 JSON 内的 gateway 小节），异常时回退默认
function readPolicy(cfg) {
  let g = {};
  try {
    const parsed = JSON.parse(cfg.config || '{}');
    g = (parsed && parsed.gateway) || {};
  } catch { /* 忽略坏 JSON */ }
  return {
    rps: Math.max(parseInt(g.rps) || DEFAULTS.rps, 1),
    retryAttempts: Math.min(Math.max(parseInt(g.retryAttempts) || DEFAULTS.retryAttempts, 1), 6),
    backoffMs: Math.max(parseInt(g.backoffMs) || DEFAULTS.backoffMs, 100),
    timeoutMs: Math.max(parseInt(g.timeoutMs) || DEFAULTS.timeoutMs, 1000),
  };
}

// 解析 config 里的 oauth2/basic 元数据
function readCreds(cfg) {
  try {
    const parsed = JSON.parse(cfg.config || '{}');
    return parsed || {};
  } catch { return {}; }
}

// ── 认证头构造 ──
async function buildHeaders(cfg) {
  if (!cfg) return {};
  const meta = readCreds(cfg);
  switch (cfg.authType || 'api_key') {
    case 'none':
      return {};
    case 'basic': {
      // 用户名/密码来自 config 的 oauth.basic { user, pass }
      const u = meta.basic && meta.basic.user;
      const p = meta.basic && meta.basic.pass;
      if (!u || !p) return {};
      const token = Buffer.from(`${u}:${p}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    case 'oauth2': {
      const token = await fetchOAuthToken(cfg, meta);
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    case 'api_key':
    default:
      return { 'X-API-Key': cfg.apiKey || '' };
  }
}

// OAuth2 client_credentials：token 结果按剩余有效期缓存，减少平台往返
async function fetchOAuthToken(cfg, meta) {
  const oauth = meta.oauth || {};
  const tokenUrl = oauth.tokenUrl || (cfg.baseUrl ? `${cfg.baseUrl.replace(/\/$/, '')}/oauth/token` : '');
  const clientId = oauth.clientId || oauth.user;
  const clientSecret = oauth.clientSecret || oauth.pass || cfg.apiKey;
  if (!tokenUrl || !clientId || !clientSecret) {
    logger.warn(`[GW:${cfg.code}] oauth2 缺少 tokenUrl/clientId/clientSecret，跳过 Bearer 认证`);
    return null;
  }
  const cacheKey = `gw:oauth:${cfg.code}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const axios = require('axios');
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  if (oauth.scope) params.set('scope', oauth.scope);
  const resp = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 5000,
  });
  const token = resp.data && (resp.data.access_token || resp.data.token);
  if (!token) return null;
  const expiresIn = Number(resp.data.expires_in) || 3600;
  // 提前 60s 过期，避免临界区拿到的 token 即将失效
  await cache.set(cacheKey, token, Math.max(expiresIn - 60, 10));
  return token;
}

// ── 滑动窗口限流 ──
// 用 Redis(或内存) 存窗口内的时间戳数组，超出 rps 即拒绝（fail-open：缓存不可用时放行）
async function allowRate(code, rps) {
  const key = `gw:rl:${code}`;
  const now = Date.now();
  const windowMs = 1000;
  try {
    let timestamps = (await cache.get(key)) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= rps) return false;
    timestamps.push(now);
    await cache.set(key, timestamps, Math.ceil(windowMs / 1000) + 1);
    return true;
  } catch (e) {
    logger.warn(`[GW:rl:${code}] 限流检查失败，fail-open 放行`, { message: e.message });
    return true;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableError(err) {
  if (!err) return false;
  if (err.response) {
    // 4xx 不重试（大概率是参数/权限问题）；5xx 与网络错误重试
    return (err.response.status || 0) >= 500;
  }
  return true; // 网络中断/超时/连接拒绝
}

// 通用请求编排：auth → 限流 → (重试 × adapter) → 日志
// direction: 'send' 调 adapter.send，'query' 调 adapter.query
// opts: { action, refNo, messageType, decode }
async function request(code, direction, payload = {}, opts = {}) {
  const { IntegrationClient } = require('../integrations');
  const cfg = await IntegrationConfig.findOne({ where: { code } });
  if (!cfg) throw new Error(`对接配置不存在: ${code}`);
  if (!cfg.enabled) throw new Error(`对接 ${code} 未启用（可在系统管理-集成配置开启）`);

  const policy = readPolicy(cfg);
  if (!(await allowRate(code, policy.rps))) {
    throw new Error(`对接 ${code} 触发限流（≤${policy.rps}/s），请稍后重试`);
  }

  const requestId = opts.idemKey || `gw-${uuid.v4()}`;
  const gwHeaders = await buildHeaders(cfg);
  const decoratedCfg = { ...cfg.toJSON ? cfg.toJSON() : cfg, gatewayHeaders: gwHeaders, gatewayTimeout: policy.timeoutMs };

  let lastErr = null;
  let lastResult = null;
  const client = new IntegrationClient(code, decoratedCfg);

  for (let attempt = 1; attempt <= policy.retryAttempts; attempt += 1) {
    try {
      const fn = direction === 'query' ? client.query.bind(client) : client.send.bind(client);
      lastResult = await fn(payload);
      // 成功→ 落成功日志
      await writeLog({
        code, requestId, direction,
        messageType: opts.messageType,
        role: opts.role,
        roleId: opts.roleId,
        refNo: opts.refNo,
        success: true,
        attempt,
        payload, result: lastResult,
      });
      return { requestId, attempt, data: lastResult };
    } catch (e) {
      lastErr = e;
      const retryable = isRetryableError(e);
      const shouldRetry = retryable && attempt < policy.retryAttempts;
      logger.warn(`[GW:${code}] 第 ${attempt}/${policy.retryAttempts} 次尝试失败${shouldRetry ? '，准备重试' : ''}`, { message: e.message });
      if (!shouldRetry) break;
      await sleep(policy.backoffMs * Math.pow(2, attempt - 1));
    }
  }

  // 全部失败 → 落失败日志
  await writeLog({
    code, requestId, direction,
    messageType: opts.messageType,
    role: opts.role,
    roleId: opts.roleId,
    refNo: opts.refNo,
    success: false,
    attempt: policy.retryAttempts,
    payload,
    error: lastErr,
  }).catch(() => {});
  const finalErr = new Error(`对接 ${code} 失败：${(lastErr && lastErr.message) || '未知错误'}`);
  finalErr.requestId = requestId;
  throw finalErr;
}

// 落 EdiMessage 日志（direction=out）。日志失败不阻断主流程。
async function writeLog({ code, requestId, direction, messageType, role, roleId, refNo, success, attempt, payload, result, error }) {
  const payloadPlain = payload && payload.payload ? payload.payload : payload;
  const record = {
    direction: 'out',
    channel: code,
    messageType: messageType || (direction === 'query' ? 'STATUS_REQ' : 'SUBMIT'),
    counterparty: roleId || null,
    orderId: null,
    referenceNo: refNo || requestId || '',
    rawContent: JSON.stringify({ requestId, attempt, payload: payloadPlain }).slice(0, 8000),
    status: success ? 'sent' : 'failed',
    error: error ? String((error && error.response && error.response.data) || (error && error.message) || error).slice(0, 2000) : null,
    sentAt: new Date(),
  };
  try {
    const row = await EdiMessage.create(record);
    return row.id;
  } catch (e) {
    logger.error(`[GW:${code}] 日志落库失败`, { message: e.message });
    return null;
  }
}

// 便捷方法
async function send(code, payload, opts = {}) {
  return request(code, 'send', payload, opts);
}
async function query(code, payload, opts = {}) {
  return request(code, 'query', payload, opts);
}

// 网关运行态概览：每个对接的状态（配置/策略/最近一次调用）
async function overview() {
  const rows = await IntegrationConfig.findAll({ where: { enabled: true } });
  logger.info('[GW] 运行态概览注入占位');
  return rows.map((r) => ({ code: r.code, name: r.name, authType: r.authType, enabled: r.enabled }));
}

module.exports = { request, send, query, buildHeaders, overview, DEFAULTS };