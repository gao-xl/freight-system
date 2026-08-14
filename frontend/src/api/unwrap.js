// 后端响应解包纯函数：code === 0 视为成功并返回 payload，否则返回错误信息。
// 从 request 拦截器抽离为纯函数，便于 node 环境下用 vitest 单测，避免耦合 element-plus/axios。
export function unwrapResponse(payload) {
  if (payload && payload.code === 0) {
    return { ok: true, data: payload.data };
  }
  return { ok: false, message: (payload && payload.message) || '请求失败' };
}