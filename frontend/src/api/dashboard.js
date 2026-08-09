import request from './request';

export const dashboardAPI = () => request.get('/dashboard');
export const orderStatusDistAPI = () => request.get('/dashboard/order-status');
export const modeDistAPI = () => request.get('/dashboard/mode-dist');
export const recentOrdersAPI = (limit = 8) => request.get(`/dashboard/recent-orders?limit=${limit}`);
export const dashboardMetricsAPI = () => request.get('/dashboard/metrics');
export const dashboardAgingAPI = () => request.get('/dashboard/aging');
export const salesPerformanceAPI = () => request.get('/dashboard/sales-performance');