// AI 服务层（统一接入 OpenAI 兼容大模型）
// 通过 IntegrationClient(code=ai_chat) 调用，复用既有适配器/缓存/降级约定。
// 提供四大能力：chat（智能问答/助手）、extract（单据识别）、translate/generate（翻译与内容生成）、recommend（推荐/预警）。
// 数据隔离：问答/推荐所需的业务摘要按调用方 dataScope 过滤，绝不越权取数。
const { Op } = require('sequelize');
const { IntegrationClient } = require('../integrations');
const aiChatAdapter = require('../integrations/adapters/aiChat');
const { logger } = require('../utils/logger');
const { Order, FinanceRecord, AlertRecord, Quotation, Customer } = require('./dataAccess');

// 统一调用入口：未启用/未配置时抛业务错误（code 供控制器友好提示）
async function callAI({ system, user, temperature, maxTokens, json, model }) {
  const client = await IntegrationClient.get('ai_chat');
  const cfg = client.cfg;
  if (!cfg || !cfg.enabled) {
    const e = new Error('AI 对接未启用，请先在「外部对接」启用 ai_chat 并配置 API Key 与模型');
    e.code = 'AI_NOT_ENABLED';
    throw e;
  }
  const result = await client.query({ system, user, temperature, maxTokens, json, model });
  logger.info('[AI] 调用完成', { model: result.model, chars: (result.content || '').length });
  return result;
}

// 连通性测试：用给定参数（不落库、不要求已启用）直连目标服务
async function testSettings({ baseUrl, apiKey, model, temperature, maxTokens }) {
  if (!apiKey) {
    const e = new Error('缺少 API Key，无法测试');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }
  const cfg = {
    baseUrl: baseUrl || process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey,
    config: JSON.stringify({ model: model || process.env.AI_MODEL || 'openai/gpt-4o-mini', temperature: temperature ?? 0.3, maxTokens: maxTokens ?? 2048 }),
  };
  const result = await aiChatAdapter.query(cfg, {
    system: '你是货运系统 AI 连通性测试助手。',
    user: '请只回复两个字：连接成功',
    temperature: temperature ?? 0.3,
    maxTokens: maxTokens ?? 64,
  });
  return { content: result.content, model: result.model, usage: result.usage };
}

// 按 dataScope 生成查询约束（scope: all / group / self）
function scopeWhere(scope) {
  const userId = scope.userId;
  if (scope.scope === 'all') return {};
  if (scope.scope === 'group') {
    const ids = scope.groupIds || [];
    return { [Op.or]: [{ groupId: { [Op.in]: ids } }, { groupId: null }] };
  }
  return { ownerId: userId };
}

// 构建当前用户可见的业务摘要（精简，供问答/推荐作上下文）
// 只取数量级 + 关键风险，不落明细，控制 token 成本。
async function buildBusinessBrief(scope) {
  const where = scopeWhere(scope);
  const brief = {};
  try {
    const [orderCount, inTransit, activeAlerts, overdue, quotationCount, customerCount] = await Promise.all([
      Order.count({ where }),
      Order.count({ where: { ...where, status: { [Op.in]: ['confirmed', 'in_progress'] } } }),
      AlertRecord.count({ where: { status: 'active' } }),
      FinanceRecord.count({ where: { paidAt: null, status: { [Op.ne]: 'reversed' } } }),
      Quotation.count({ where }),
      Customer.count({ where }),
    ]);
    brief.orders = orderCount;
    brief.inTransit = inTransit;
    brief.activeAlerts = activeAlerts;
    brief.unsettledFinance = overdue;
    brief.quotations = quotationCount;
    brief.customers = customerCount;
  } catch (e) {
    logger.warn('[AI] 业务摘要生成失败（降级为空）', { message: e.message });
  }
  return brief;
}

// 1) 智能问答 / 业务助手：可带业务摘要上下文
async function chat({ question, scope, temperature }) {
  const brief = scope ? await buildBusinessBrief(scope) : null;
  const system = brief
    ? `你是货运代理管理系统的智能业务助手。以下是当前账号可见的核心业务概览（JSON）：\n${JSON.stringify(brief)}\n
请基于该概览和你的知识回答用户问题；涉及系统内具体数据时如实说明，不要编造不存在的数字。回答使用简体中文，简洁专业。`
    : '你是货运代理管理系统的智能业务助手。回答使用简体中文，简洁专业，不要编造系统内不存在的具体数据。';
  const result = await callAI({ system, user: question, temperature: temperature ?? 0.4 });
  return { content: result.content, model: result.model };
}

// 2) 单据智能识别：从提取的文本中解析结构化字段
const DOC_TYPE_SCHEMAS = {
  box_list: '装箱单（箱单）',
  invoice: '发票 / 费用清单',
  bl: '提单（Bill of Lading）',
  customs: '报关单',
  packing: '装箱明细',
  generic: '通用业务单据',
};
async function extract({ text, docType, temperature }) {
  if (!text || !text.trim()) throw new Error('缺少待识别的文本内容');
  const typeName = DOC_TYPE_SCHEMAS[docType] || DOC_TYPE_SCHEMAS.generic;
  const system = `你是货运单据信息抽取引擎。请从用户提供的${typeName}文本中抽取关键字段，输出严格 JSON（不要输出任何多余文字或 markdown 代码块标记）。
字段取值尽量保留原文；无法确定的值用 null。通常包含（按单据类型取舍）：shipper, consignee, notifyParty, vessel, voyage, pol(起运港), pod(目的港), containerNo, sealNo, marksNumbers, cargoDesc, grossWeight, netWeight, volume, packageCount, packageUnit, billOfLadingNo, invoiceNo, amount, currency, date, dueDate, remark。
输出格式：{"success":true,"fields":{...},"confidence":"high|medium|low","notes":"对无法识别字段的说明"}`;
  const result = await callAI({ system, user: text, temperature: temperature ?? 0.1, json: true, maxTokens: 2048 });
  let parsed = { success: false, fields: {}, confidence: 'low', notes: '' };
  try {
    const cleaned = (result.content || '').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    logger.warn('[AI] 单据识别结果非合法 JSON，原样返回', { message: e.message });
    parsed = { success: false, fields: { raw: result.content }, confidence: 'low', notes: '模型返回非 JSON，请重试或人工录入' };
  }
  return { ...parsed, model: result.model };
}

// 3) 翻译 / 内容生成
async function generate({ kind, input, targetLang, tone, temperature }) {
  const presets = {
    translate: `你是货代行业专业翻译。请把用户文本翻译成${targetLang || '英语'}，保持术语准确（如 POL/POD/ETA/containerNo 等缩写保留），输出仅译文。`,
    email: `你是货代业务邮件撰写助手。请根据用户描述撰写一封专业的${targetLang || '中文'}商务邮件（邮件要有主题与正文，语气${tone || '专业友好'}），输出仅邮件内容。`,
    quotation_note: `你是货代报价助手。请根据用户提供的运价信息，生成一段${targetLang || '中文'}的报价说明/发函，语言${tone || '专业'}，突出航线、运价、有效期。输出仅内容。`,
    notification: `你是货代业务通知撰写助手。请将用户要点整理成${targetLang || '中文'}的客户通知/公告，结构清晰、语气${tone || '正式'}。输出仅内容。`,
    default: `你是货代业务写作助手。请依据用户要求生成${targetLang || '中文'}内容，语气${tone || '专业'}。输出仅最终内容，不要解释。`,
  };
  const system = presets[kind] || presets.default;
  const result = await callAI({ system, user: input, temperature: temperature ?? 0.5, maxTokens: 2048 });
  return { content: result.content, model: result.model };
}

// 4) 智能推荐 / 预警分析
const RECOMMEND_KINDS = {
  freight_rate: '运价推荐',
  customer_follow: '客户跟进建议',
  risk: '走货风险预警',
  sales: '销售/经营建议',
  default: '综合经营参考',
};
async function recommend({ kind, data, scope, temperature }) {
  const brief = scope ? await buildBusinessBrief(scope) : null;
  const typeName = RECOMMEND_KINDS[kind] || RECOMMEND_KINDS.default;
  const system = `你是货运代理公司的${typeName}助手。用户会提供业务数据（可能是 JSON 或文本）以及当前账号可见的业务概览。
请分析并给出${typeName}，输出结构清晰、可执行的建议（要点式，中文）。不要编造数据中不存在的信息；基于给定数据给出结论。`;
  const user = `【业务概览】${brief ? JSON.stringify(brief) : '（未提供）'}\n【待分析数据】\n${typeof data === 'string' ? data : JSON.stringify(data || {})}`;
  const result = await callAI({ system, user, temperature: temperature ?? 0.4, maxTokens: 2048 });
  return { content: result.content, model: result.model };
}

module.exports = { callAI, chat, extract, generate, recommend, buildBusinessBrief, testSettings };