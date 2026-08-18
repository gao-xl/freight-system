// AI 控制器：统一第三方大模型能力入口
// 接口：/api/ai/chat /api/ai/extract /api/ai/generate /api/ai/recommend /api/ai/status
//      /api/ai/providers /api/ai/settings(GET/PUT) /api/ai/test
// 数据隔离：业务问答/推荐所需的摘要按 req.dataScope 过滤（guard 之后已挂载 dataScope）
const { ok, fail, asyncHandler } = require('../utils/response');
const { getScope } = require('../middleware/dataScope');
const svc = require('../services/aiService');
const { IntegrationConfig } = require('../services/dataAccess');

// POST /api/ai/chat  智能问答 / 业务助手
const chat = asyncHandler(async (req, res) => {
  const { question, temperature } = req.body || {};
  if (!question || !String(question).trim()) return fail(res, '缺少问题内容');
  try {
    const scope = await getScope(req);
    const data = await svc.chat({ question: String(question), scope, temperature });
    ok(res, data);
  } catch (e) {
    const code = e.code || '';
    fail(res, code === 'AI_NOT_ENABLED' ? e.message : `AI 调用失败：${e.message}`, 1, 502);
  }
});

// POST /api/ai/extract  单据智能识别（传入已提取的文本）
const extract = asyncHandler(async (req, res) => {
  const { text, docType, temperature } = req.body || {};
  if (!text || !String(text).trim()) return fail(res, '缺少待识别文本');
  try {
    const data = await svc.extract({ text: String(text), docType, temperature });
    ok(res, data);
  } catch (e) {
    fail(res, `单据识别失败：${e.message}`, 1, 502);
  }
});

// POST /api/ai/generate  翻译与内容生成（kind: translate/email/quotation_note/notification）
const generate = asyncHandler(async (req, res) => {
  const { kind, input, targetLang, tone, temperature } = req.body || {};
  if (!input || !String(input).trim()) return fail(res, '缺少生成内容');
  try {
    const data = await svc.generate({ kind, input: String(input), targetLang, tone, temperature });
    ok(res, data);
  } catch (e) {
    fail(res, `生成失败：${e.message}`, 1, 502);
  }
});

// POST /api/ai/recommend  智能推荐 / 预警分析
const recommend = asyncHandler(async (req, res) => {
  const { kind, data, temperature } = req.body || {};
  if (data === undefined || data === null) return fail(res, '缺少待分析数据');
  try {
    const scope = await getScope(req);
    const result = await svc.recommend({ kind, data, scope, temperature });
    ok(res, result);
  } catch (e) {
    fail(res, `分析失败：${e.message}`, 1, 502);
  }
});

// GET /api/ai/status  查看 AI 对接状态（不暴露 apiKey）
const status = asyncHandler(async (req, res) => {
  const cfg = await IntegrationConfig.findOne({ where: { code: 'ai_chat' } });
  if (!cfg) return ok(res, { enabled: false, configured: false, model: null, message: '尚未配置 ai_chat 对接' });
  let model = null;
  try { model = cfg.config ? JSON.parse(cfg.config).model : null; } catch {}
  ok(res, { enabled: cfg.enabled, configured: !!cfg.apiKey, model, message: null });
});

// 解析 config JSON 并展平保存字段
function parseConfig(cfg) {
  let ext = {};
  try { ext = cfg.config ? JSON.parse(cfg.config) : {}; } catch {}
  return {
    baseUrl: cfg.baseUrl || '',
    model: ext.model || '',
    temperature: typeof ext.temperature === 'number' ? ext.temperature : 0.3,
    maxTokens: ext.maxTokens || 2048,
    enabled: !!cfg.enabled,
    apiKeySet: !!cfg.apiKey,
    apiKeyTail: cfg.apiKey && cfg.apiKey.length > 4 ? cfg.apiKey.slice(-4) : '',
  };
}

// GET /api/ai/settings  读取当前 AI 设置（apiKey 打码）
const getSettings = asyncHandler(async (req, res) => {
  const cfg = await IntegrationConfig.findOne({ where: { code: 'ai_chat' } });
  if (!cfg) return ok(res, parseConfig({ enabled: false }));
  ok(res, parseConfig(cfg));
});

// PUT /api/ai/settings  保存 AI 设置（写入 IntegrationConfig.code=ai_chat，apiKey 留空则保留原值）
const saveSettings = asyncHandler(async (req, res) => {
  const { baseUrl = '', apiKey = '', model = '', temperature, maxTokens, enabled = false } = req.body || {};
  if (!baseUrl) return fail(res, '请填写 Base URL');
  if (!model) return fail(res, '请填写模型名');
  const cfg = await IntegrationConfig.findOne({ where: { code: 'ai_chat' } });
  const nextApiKey = apiKey ? apiKey : (cfg ? cfg.apiKey : '');
  const config = JSON.stringify({
    model,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    maxTokens: maxTokens || 2048,
  });
  if (cfg) {
    await cfg.update({ name: 'AI 大模型（OpenAI 兼容）', baseUrl, apiKey: nextApiKey, enabled, config });
  } else {
    await IntegrationConfig.create({
      code: 'ai_chat', name: 'AI 大模型（OpenAI 兼容）', baseUrl, authType: 'api_key', apiKey: nextApiKey, enabled, config,
      remark: '在「设置 → AI 设置」中配置；支持任意 OpenAI 兼容服务',
    });
  }
  ok(res, { baseUrl, configured: !!nextApiKey, enabled }, 'AI 设置已保存');
});

// POST /api/ai/test  用给定参数测试连通性（不落库）
const test = asyncHandler(async (req, res) => {
  const { baseUrl, apiKey, model, temperature, maxTokens } = req.body || {};
  if (!apiKey) return fail(res, '请先填写 API Key 再测试');
  try {
    const data = await svc.testSettings({ baseUrl, apiKey, model, temperature, maxTokens });
    ok(res, data, '连接成功');
  } catch (e) {
    fail(res, `连接失败：${e.message}`, 1, 502);
  }
});

// P3-1 智能 HS 归类：优先调用大模型返回 Top5，未启用/失败时回退本地 HS 知识库关键词检索。
const { HsCode } = require('../services/dataAccess');
const { Op } = require('sequelize');
const hsClassify = asyncHandler(async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return fail(res, '请输入商品品名或描述');
  const items = [];
  let source = '';
  try {
    const r = await svc.chat({
      question: [
        `请根据以下商品描述给出最可能的 5 个 HS 编码（含校准建议）：「${text.slice(0, 200)}」`,
        '只返回 JSON 数组，每项含字段：code(6位)、name、importRate(进口关税率%)、exportRate(出口退税率%)、vatRate(增值税率%)、reason。不要额外文字。',
      ].join('\n'),
      json: true,
    });
    let arr = null;
    const raw = r && r.content;
    const m = raw ? raw.match(/\[[\s\S]*\]/) : null;
    if (m) { try { arr = JSON.parse(m[0]); } catch { arr = null; } }
    if (Array.isArray(arr) && arr.length) {
      source = 'ai';
      for (const it of arr.slice(0, 5)) {
        items.push({
          code: String(it.code || ''), name: it.name || text, importRate: it.importRate, exportRate: it.exportRate,
          vatRate: it.vatRate, supervision: '', confidence: null, reason: it.reason || '',
        });
      }
    }
  } catch (e) {
    if (e.code !== 'AI_NOT_ENABLED' && e.code !== 'AI_NOT_CONFIGURED') {
      // 其它异常仅记录，仍走本地兜底
      const { logger } = require('../utils/logger');
      logger.warn('[HS分类] AI 调用失败，回退本地检索', { message: e.message });
    }
  }
  if (!items.length) {
    source = 'local';
    const rows = await HsCode.findAll({
      where: { [Op.or]: [{ name: { [Op.like]: `%${text}%` } }, { code: { [Op.like]: `%${text}%` } }] },
      order: [['isCommon', 'DESC']], limit: 8,
    });
    // 关键词拆分词后二次模糊匹配，提升召回
    const tokens = text.replace(/\s+/g, '').slice(0, 12);
    const fuzzy = tokens.length > 1
      ? await HsCode.findAll({ where: { name: { [Op.like]: `%${tokens}%` } }, limit: 8 })
      : [];
    const seen = new Set();
    for (const row of [...rows, ...fuzzy]) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      items.push({
        code: row.code, name: row.name, importRate: row.importRate, exportRate: row.exportRate,
        vatRate: row.vatRate, supervision: row.supervision || '', confidence: null, reason: '本地知识库匹配',
      });
      if (items.length >= 5) break;
    }
  }
  ok(res, { source, text, items });
});

// P3-1 客户门户智能客服：仅限客户角色，基于其自身订单/跟踪/账单/运价上下文作答。
// AI 未启用时回退基于本地数据的确定性回答。
const { Order, ShipmentTrack, FinanceRecord } = require('../services/dataAccess');
const customerSupport = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 403);
  const question = String((req.body && req.body.question) || '').trim();
  if (!question) return fail(res, '请输入您的问题');
  try {
    const orders = await Order.findAll({ where: { customerId }, order: [['createdAt', 'DESC']], limit: 5, attributes: ['id', 'orderNo', 'status', 'route', 'etaDate', 'createdAt'] });
    const orderIds = orders.map((o) => o.id);
    const tracks = orderIds.length ? await ShipmentTrack.findAll({ where: { orderId: { [Op.in]: orderIds } }, order: [['createdAt', 'DESC']], limit: 10, attributes: ['orderId', 'location', 'status', 'createdAt'] }) : [];
    const bills = orderIds.length ? await FinanceRecord.findAll({ where: { orderId: { [Op.in]: orderIds }, status: { [Op.ne]: 'waived' } }, order: [['createdAt', 'DESC']], limit: 8, attributes: ['orderId', 'direction', 'amount', 'currency', 'status', 'dueDate'] }) : [];
    const pendingOrderCount = await Order.count({ where: { customerId, status: { [Op.notIn]: ['completed', 'cancelled'] } } });
    const brief = {
      客户订单数: orders.length, 进行中订单: pendingOrderCount,
      最近订单: orders.map((o) => `${o.orderNo}(${o.status}${o.route ? `/${o.route}` : ''}${o.etaDate ? `/ETA ${o.etaDate}` : ''})`).join('；'),
      最近动态: tracks.slice(0, 5).map((t) => `${t.orderId}:${t.location || ''}${t.status || ''}`).join('；'),
      近期账单: bills.slice(0, 5).map((b) => `${b.orderId}:${b.direction === 'receivable' ? '应收' : '应付'}${b.amount}${b.currency || ''}(${b.status})`).join('；'),
    };
    let content = '';
    try {
      const r = await svc.chat({
        question: [
          `你是货代系统的客户服务助手，仅依据以下该客户的业务数据回答（勿捏造）：`,
          JSON.stringify(brief, null, 1),
          `客户问题：${question.slice(0, 300)}`,
        ].join('\n'),
      });
      content = (r && r.content) || '';
    } catch (e) {
      content = '';
    }
    if (content) return ok(res, { answer: content, mode: 'ai', brief });
    // 确定性兜底
    const q = question;
    let answer = '';
    if (/订单|单号|有几个|数量/.test(q)) {
      answer = `您当前共有 ${orders.length} 条最近订单，其中进行中 ${pendingOrderCount} 单。`;
    } else if (/跟踪|运输|到哪|位置|ETA|到港|派送/.test(q)) {
      answer = tracks.length
        ? `最近物流动态：${tracks.slice(0, 5).map((t) => `${t.orderId} 号订单：${t.location || ''}${t.status || ''}`).join('；')}`
        : '最近暂无物流动态记录。';
    } else if (/账单|费用|应收|金额|多少钱/.test(q)) {
      answer = bills.length
        ? `近期账单：${bills.slice(0, 5).map((b) => `${b.orderId} 号订单 ${b.amount}${b.currency || ''}（${b.status}）`).join('；')}`
        : '近期暂无账单。';
    } else if (/业务|客服|联系|电话/.test(q)) {
      answer = '您可在工作时段联系专属客服为您服务。您也可以留下具体问题，我们会尽快处理。';
    } else {
      answer = `已收到您的问题。可尝试询问：我的订单进度？最近物流到哪了？近期账单有哪些？`;
    }
    ok(res, { answer, mode: 'local', brief });
  } catch (e) {
    const { logger } = require('../utils/logger');
    logger.warn('[客服] 数据组装失败', { message: e.message });
    ok(res, { answer: '暂时无法获取您的业务数据，请稍后再试或联系客服专员。', mode: 'local', brief: {} });
  }
});

module.exports = { chat, extract, generate, recommend, status, getSettings, saveSettings, test, hsClassify, customerSupport };