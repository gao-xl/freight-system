import request from './request';

// 认证
export const loginAPI = (data) => request.post('/auth/login', data);
export const meAPI = () => request.get('/auth/me');
export const changePasswordAPI = (data) => request.post('/auth/change-password', data);

// 全局搜索：跨客户/供应商/订单/报价
export const globalSearchAPI = (params = {}) => request.get('/search', { params });

// Onboarding 引导系统
export const initStatusAPI = () => request.get('/system/init-status');
export const setupAdminAPI = (data) => request.post('/system/setup-admin', data);
export const createDemoDataAPI = () => request.post('/system/demo-data');
export const clearDemoDataAPI = () => request.delete('/system/demo-data');