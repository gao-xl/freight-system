// AI 控制器：统一第三方大模型能力入口
// 接口：/api/ai/chat /api/ai/extract /api/ai/generate /api/ai/recommend /api/ai/status
// 数据隔离：业务问答/推荐所需的摘要按 req.dataScope 过滤（guard 之后已挂载 dataScope）
const { ok, fail, asyncHandler } = require('../utils/response');
const { getScope } = require('../middleware/dataScope');
const svc = require('../services/aiService');

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
  const { IntegrationConfig } = require('./../services/dataAccess');
  const cfg = await IntegrationConfig.findOne({ where: { code: 'ai_chat' } });
  if (!cfg) return ok(res, { enabled: false, configured: false, model: null, message: '尚未配置 ai_chat 对接' });
  let model = null;
  try { model = cfg.config ? JSON.parse(cfg.config).model : null; } catch {}
  ok(res, { enabled: cfg.enabled, configured: !!cfg.apiKey, model, message: null });
});

module.exports = { chat, extract, generate, recommend, status };