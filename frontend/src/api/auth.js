import request from './request';

// 认证
export const loginAPI = (data) => request.post('/auth/login', data);
export const meAPI = () => request.get('/auth/me');
export const changePasswordAPI = (data) => request.post('/auth/change-password', data);
// M3 会话增强：refresh token 刷新 / 端线下线 / 全局下线 / 会话列表
export const refreshAPI = (data) => request.post('/auth/refresh', data, { silent: true });
export const logoutAPI = () => request.post('/auth/logout');
export const logoutAllAPI = () => request.post('/auth/logout-all');
export const sessionsAPI = () => request.get('/auth/sessions');

// S4 二次认证（2FA）：登录暂态验证 / TOTP 绑定解绑 / 敏感操作复核
export const send2faAPI = (pendingToken) => request.post('/auth/2fa/send', { pendingToken });
export const verify2faAPI = (pendingToken, code) => request.post('/auth/2fa/verify', { pendingToken, code });
export const setupTotpAPI = () => request.post('/auth/2fa/setup');
export const disable2faAPI = (password) => request.post('/auth/2fa/disable', { password });
export const reauthSendAPI = () => request.post('/auth/2fa/reauth/send');
export const reauthVerifyAPI = (code) => request.post('/auth/2fa/reauth/verify', { code });

// 全局搜索：跨客户/供应商/订单/报价
export const globalSearchAPI = (params = {}) => request.get('/search', { params });

// Onboarding 引导系统
export const initStatusAPI = () => request.get('/system/init-status');
export const setupAdminAPI = (data) => request.post('/system/setup-admin', data);
export const createDemoDataAPI = () => request.post('/system/demo-data');
export const clearDemoDataAPI = () => request.delete('/system/demo-data');