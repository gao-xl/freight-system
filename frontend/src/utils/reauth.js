// S4 敏感操作复核：请求拦截器与 ReauthDialog 之间的单飞桥接。
// 后端对敏感操作返回 428（需要二次验证）时，request.js 调用 requestReauth()，
// ReauthDialog 弹窗完成邮箱码/TOTP 校验后 resolve 出短效 reauthToken，拦截器据此重放原请求。
import { reactive } from 'vue';

export const reauthState = reactive({ visible: false });

let current = null;

export function requestReauth() {
  // 单飞：并发 428 只弹一次窗，共用同一个 resolver
  if (current) return current.promise;
  reauthState.visible = true;
  current = {};
  current.promise = new Promise((resolve, reject) => {
    current.resolve = (token) => { cleanup(); resolve(token); };
    current.reject = (err) => { cleanup(); reject(err); };
  });
  return current.promise;
}

export function resolveReauth(token) {
  if (current) current.resolve(token);
}

export function rejectReauth(err) {
  if (current) current.reject(err);
}

function cleanup() {
  current = null;
  reauthState.visible = false;
}