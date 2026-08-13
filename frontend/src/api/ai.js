import request from './request';

// 第三方 AI 能力（OpenAI 兼容 / OpenRouter）
export const aiAPI = {
  status: () => request.get('/ai/status'),
  chat: (data) => request.post('/ai/chat', data),
  extract: (data) => request.post('/ai/extract', data),
  generate: (data) => request.post('/ai/generate', data),
  recommend: (data) => request.post('/ai/recommend', data),
  // AI 服务商设置
  getSettings: () => request.get('/ai/settings'),
  saveSettings: (data) => request.put('/ai/settings', data),
  test: (data) => request.post('/ai/test', data),
};