const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const gateway = require('../services/integrationGateway');
const { EdiMessage, IntegrationConfig, IntegrationClient } = require('../services/dataAccess');
const { logger } = require('../utils/logger');

// 解析入站回调的 HMAC 签名密钥：优先取已注册的 IntegrationClient（按 client 维度管理），
// 未注册时回退 IntegrationConfig 旧配置，保证存量回调不中断。
async function resolveCallbackSecret(clientCode, fallbackCfgCode) {
  try {
    const cli = await IntegrationClient.findOne({ where: { code: clientCode, enabled: true } });
    if (cli && cli.apiKey) return { secret: cli.apiKey, clientId: cli.id };
  } catch (e) {
    logger.warn(`[CALLBACK] 读取 IntegrationClient(${clientCode}) 失败`, { message: e.message });
  }
  try {
    const cfg = await IntegrationConfig.findOne({ where: { code: fallbackCfgCode } });
    if (cfg && cfg.enabled && cfg.apiKey) return { secret: cfg.apiKey, clientId: null };
  } catch (e) {
    logger.warn(`[CALLBACK] 读取 IntegrationConfig(${fallbackCfgCode}) 失败`, { message: e.message });
  }
  return { secret: null, clientId: null };
}

// P2-1 API 集成网关控制器：管理手动调用、日志查询、对接状态概览

// 手动发起一次网关请求 POST /integrations/gateway/send
// body: { code, action: 'send'|'query', payload, messageType, refNo }
const invoke = asyncHandler(async (req, res) => {
  const { code, action = 'send', payload = {}, messageType, refNo } = req.body;
  if (!code) return fail(res, '缺少对接编码 code', 1, 400);
  if (!['send', 'query'].includes(action)) return fail(res, 'action 仅支持 send/query', 1, 400);
  try {
    const result = await gateway.request(code, action, payload, { messageType, refNo });
    return ok(res, result, `对接 ${code} ${action} 成功（attempt=${result.attempt}）`);
  } catch (e) {
    return fail(res, e.message, 1, e.statusCode || 502);
  }
});

// 网关日志查询 GET /integrations/gateway/logs?channel=&direction=&status=&page=&pageSize=
const logs = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { channel, direction, status, messageType } = req.query;
  const where = { direction: 'out' };
  if (channel) where.channel = channel;
  if (direction === 'in') where.direction = 'in';
  if (status) where.status = status;
  if (messageType) where.messageType = messageType;
  const { rows, count } = await EdiMessage.findAndCountAll({
    where, order: [['id', 'DESC']], limit, offset, distinct: true,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// 对接运行态概览 GET /integrations/gateway/status
// 返回每个启用对接的配置 + 网关策略 + 最近调用
const status = asyncHandler(async (req, res) => {
  const rows = await IntegrationConfig.findAll({ order: [['id', 'ASC']] });
  const list = rows.map((r) => {
    let policy = null;
    let parsed;
    try { parsed = JSON.parse(r.config || '{}'); } catch { parsed = {}; }
    if (parsed && parsed.gateway) policy = parsed.gateway;
    return {
      id: r.id, code: r.code, name: r.name, baseUrl: r.baseUrl,
      authType: r.authType, enabled: r.enabled, lastSyncAt: r.lastSyncAt,
      gatewayPolicy: policy,
    };
  });
  ok(res, { list, total: list.length });
});

// ── P2-2 海关单一窗口入站回调 ──
// POST /api/v1/callbacks/customs
// body: { declNo, status, customsNo, inspectionResult, releaseDate, messageTime, raw }
// 鉴权：请求头 X-GW-Sign = HMAC-SHA256(secret, rawBody)；secret 优先取 IntegrationClient(customs).apiKey，
// 未注册时回退 IntegrationConfig(customs).apiKey。
// 若未启用/未配置 customs 对接或签名不匹配，报文仍落库标记 unverified，不更新业务状态（防伪造）。
const customsCallback = asyncHandler(async (req, res) => {
  const crypto = require('crypto');
  const rawBody = JSON.stringify(req.body || {});
  const signature = req.headers['x-gw-sign'] || '';
  // 密钥优先来自 IntegrationClient（client 维度），未注册时回退 IntegrationConfig，防伪造且兼容存量
  const { secret, clientId } = await resolveCallbackSecret('customs', 'customs');
  const expected = secret ? crypto.createHmac('sha256', secret).update(rawBody).digest('hex') : null;
  const verified = !!expected && !!signature && signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  // 报文落 EdiMessage（direction=in）
  const declNo = req.body.declNo || req.body.customsNo || '';
  let ediId = null;
  try {
    const edi = await EdiMessage.create({
      direction: 'in',
      channel: 'customs',
      messageType: 'DECL_RECEIPT',
      referenceNo: declNo || '',
      rawContent: rawBody.slice(0, 8000),
      status: 'received',
      receivedAt: new Date(),
    });
    ediId = edi.id;
  } catch (e) {
    logger.error('[CALLBACK:customs] 回调报文落库失败', { message: e.message });
  }

  // 有注册的 client 时，无论校验是否通过都累计调用量（审计维度）
  if (clientId != null) {
    IntegrationClient.increment('callCount', { where: { id: clientId } }).catch((e) =>
      logger.warn('[CALLBACK:customs] 更新调用计数失败', { message: e.message }));
    IntegrationClient.update({ lastCallAt: new Date() }, { where: { id: clientId } }).catch((e) =>
      logger.warn('[CALLBACK:customs] 更新调用时间失败', { message: e.message }));
  }

  if (!verified) {
    logger.warn('[CALLBACK:customs] 签名校验失败或未启用对接，报文已留存，不更新业务状态', { declNo });
    return ok(res, { accepted: false, reason: 'signature_invalid_or_disabled', ediId }, '已接收（未通过校验，未处理）');
  }

  const sync = require('../services/customsSyncService');
  const result = await sync.applyReceipt(req.body).catch((e) => ({ error: e.message }));
  return ok(res, { accepted: true, ediId, result }, result.error ? '已接收，但业务更新失败' : '已接收并同步报关状态');
});

module.exports = { invoke, logs, status, customsCallback };