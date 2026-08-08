// Onboarding 引导系统 API 封装
// Spec v2.1 §5（锁定）：/api/onboarding/status · /api/onboarding/demo-data ·
//   /api/system/health · /api/system/defaults · /api/onboarding/wizard/done
// 说明：
//   - 这些端点常被"预取"（如状态轮询/健康探测），失败属正常等待（后端同事联调中），
//     故使用独立静默实例，不触发全局错误 Toast，由调用方按需提示。
//   - demo-data 新路径 404 时自动回退旧兼容别名 /system/demo-data（Spec §6 保留别名）。

import axios from 'axios';

// 静默实例：仅带鉴权头，不做统一错误 Toast
const silent = axios.create({ baseURL: '/api', timeout: 15000 });
silent.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// 统一解包：{ code:0, data } 结构；业务错误/HTTP 错误原样 reject，交给调用方
silent.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) return res.data;
      return Promise.reject(new Error(res.message || '请求失败'));
    }
    return res;
  },
  (error) => Promise.reject(error)
);

function is404(error) {
  return error?.response?.status === 404;
}

// 空态判定权威源：GET /api/onboarding/status
export function getOnboardingStatus() {
  return silent.get('/onboarding/status');
}

// 一键生成示例数据：优先新路径，404 回退旧别名
export async function generateDemoData() {
  try {
    return await silent.post('/onboarding/demo-data');
  } catch (error) {
    if (is404(error)) return silent.post('/system/demo-data');
    throw error;
  }
}

// 清空示例数据：优先新路径，404 回退旧别名
export async function clearDemoData() {
  try {
    return await silent.delete('/onboarding/demo-data');
  } catch (error) {
    if (is404(error)) return silent.delete('/system/demo-data');
    throw error;
  }
}

// 系统健康三态：GET /api/system/health
export function getSystemHealth() {
  return silent.get('/system/health');
}

// 默认设置读写（CompanyProfile.defaultCurrency，默认 CNY）
export function getSystemDefaults() {
  return silent.get('/system/defaults');
}
export function saveSystemDefaults(data) {
  return silent.put('/system/defaults', data);
}

// 标记向导完成（MVP 用 localStorage，接口预留）
export function markWizardDone() {
  return silent.post('/onboarding/wizard/done').catch(() => null);
}
