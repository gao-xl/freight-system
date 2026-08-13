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

module.exports = { chat, extract, generate, recommend, status, getSettings, saveSettings, test };