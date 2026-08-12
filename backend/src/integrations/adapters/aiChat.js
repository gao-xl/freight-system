// AI 对话适配器（OpenAI 兼容协议）
// 支持任意 OpenAI 兼容的 /chat/completions 服务：OpenRouter、OpenAI、通义、DeepSeek、本地 vLLM 等。
// 配置通过 IntegrationConfig(code=ai_chat) 维护：
//   baseUrl  → 服务根地址，如 https://openrouter.ai/api/v1（默认）
//   apiKey   → 服务商 API Key
//   config   → JSON：{ model, temperature, maxTokens }（model 必填，其余可选）
// 兼容环境变量覆盖默认：AI_BASE_URL / AI_API_KEY / AI_MODEL（未在表配置时兜底）
const axios = require('axios');

const code = 'ai_chat';

function safeParse(str) {
  try { return str ? JSON.parse(str) : {}; } catch { return {}; }
}

async function callCompletion(cfg, payload) {
  const baseUrl = (cfg.baseUrl || process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const apiKey = cfg.apiKey || process.env.AI_API_KEY || '';
  if (!apiKey) {
    const e = new Error('AI 对接未配置 API Key（请在外面对接页配置 ai_chat 的 apiKey，或设置环境变量 AI_API_KEY）');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }
  const cfgJson = safeParse(cfg.config);
  const model = payload.model || cfgJson.model || process.env.AI_MODEL || 'openai/gpt-4o-mini';
  const temperature = payload.temperature ?? cfgJson.temperature ?? 0.3;
  const maxTokens = payload.maxTokens ?? cfgJson.maxTokens ?? 2048;

  const messages = [];
  if (payload.system) messages.push({ role: 'system', content: payload.system });
  if (Array.isArray(payload.messages)) messages.push(...payload.messages);
  else if (payload.user) messages.push({ role: 'user', content: payload.user });
  if (!messages.length) throw new Error('AI 请求缺少对话内容');

  const resp = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: payload.json ? { type: 'json_object' } : undefined,
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter 要求这两个 header（可选但建议）
      'HTTP-Referer': 'https://freight.internal',
      'X-Title': 'Freight System',
    },
    timeout: 30000,
  });

  const choice = resp.data && resp.data.choices && resp.data.choices[0];
  return {
    content: (choice && choice.message && choice.message.content) || '',
    model: resp.data && resp.data.model,
    usage: resp.data && resp.data.usage ? resp.data.usage : null,
  };
}

async function query(cfg, payload) {
  return callCompletion(cfg, payload);
}

async function send(cfg, payload) {
  return callCompletion(cfg, payload);
}

module.exports = { code, name: 'AI 大模型（OpenAI 兼容）', send, query };