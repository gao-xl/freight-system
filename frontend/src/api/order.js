import request from './request';

// 通用 CRUD 工厂
const crud = (resource) => ({
  list: (params) => request.get(`/${resource}`, { params }),
  get: (id) => request.get(`/${resource}/${id}`),
  create: (data) => request.post(`/${resource}`, data),
  update: (id, data) => request.put(`/${resource}/${id}`, data),
  remove: (id) => request.delete(`/${resource}/${id}`),
  batchRemove: (ids) => request.post(`/${resource}/batch-delete`, { ids }),
  batchUpdate: (ids, data) => request.post(`/${resource}/batch-update`, { ids, data }),
  restore: (id) => request.post(`/${resource}/${id}/restore`),
});

export const orderAPI = crud('orders');
export const orderDetailAPI = (id) => request.get(`/orders/${id}/detail`);
export const orderTimelineAPI = (id) => request.get(`/orders/${id}/timeline`);
export const orderFlowAPI = (id) => request.get(`/orders/${id}/flow`);
export const orderAdvanceAPI = (id, node) => request.post(`/orders/${id}/advance`, { node });
export const orderBatchAdvanceAPI = (ids, node) => request.post(`/orders/batch-advance`, { ids, node });
export const orderBatchStatusAPI = (ids, status) => request.post(`/orders/batch-status`, { ids, status });
// 导出（U2：携带当前筛选条件，导出=所见）
export const orderExportAPI = (params) => request.get('/orders/export', { params, responseType: 'blob' });
// 单票毛利（B6）
export const orderProfitAPI = (id) => request.get(`/orders/${id}/profit`);
export const orderProfitSummaryAPI = (params) => request.get('/orders/profit-summary', { params });
// C6 一单多箱
export const orderContainersAPI = (orderId) => request.get(`/orders/${orderId}/containers`);
export const saveOrderContainersAPI = (orderId, data) => request.put(`/orders/${orderId}/containers`, data);
// B3 进出口流程节点
export const flowNodesAPI = (bizType) => request.get('/flow-nodes', { params: { bizType } });
export const updateFlowNodeAPI = (id, data) => request.put(`/flow-nodes/${id}`, data);
export const orderNodesAPI = (id) => request.get(`/orders/${id}/nodes`);
export const updateOrderNodeAPI = (id, nodeCode, data) => request.put(`/orders/${id}/nodes/${nodeCode}`, data);
export const flowStatsAPI = () => request.get('/flow-stats');
// B8 放单控制
export const releaseAPI = {
  list: (params) => request.get('/release', { params }),
  records: (orderId) => request.get(`/release/orders/${orderId}`),
  apply: (orderId, data) => request.post(`/orders/${orderId}/release`, data),
  approve: (id, data) => request.post(`/release/${id}/approve`, data),
};