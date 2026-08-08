// Onboarding 埋点工具：默认 no-op（隐私优先），VITE_TRACK=1 时输出到 console
// 后续可平滑替换为真实上报（自建轻量接口或第三方），无需改动调用方
const ENABLED = import.meta.env.VITE_TRACK === '1';

export function track(event, payload = {}) {
  if (!ENABLED) return;
  // eslint-disable-next-line no-console
  console.debug(`[TRACK] ${event}`, payload);
  // TODO(P2)：上报端点接好后在此追加 fetch 调用，默认关闭不影响生产
}
