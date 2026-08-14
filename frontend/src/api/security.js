// 系统安全检测 API 封装
// 调用后端 POST /api/system/security-check（admin），返回三态安全检测结果
import request from './request';

export function runSecurityCheck() {
  return request.post('/system/security-check');
}