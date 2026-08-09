import request from './request';

// C5 客户自助门户
export const portalAPI = {
  overview: () => request.get('/portal/overview'),
  orders: (params) => request.get('/portal/orders', { params }),
  bills: (params) => request.get('/portal/bills', { params }),
  orderDetail: (id) => request.get(`/portal/orders/${id}`),
  // E3 客户门户增强：账单/提单 PDF 下载（blob 保留完整响应以解析 Content-Disposition）
  invoiceDownload: (orderId, invoiceId) => request.get(`/portal/orders/${orderId}/invoices/${invoiceId}/download`, { responseType: 'blob', silent: true }),
  documentDownload: (orderId, docId) => request.get(`/portal/orders/${orderId}/documents/${docId}/download`, { responseType: 'blob', silent: true }),
  // E3 在线补料(SI)：POST /portal/orders/:id/si
  submitSI: (orderId, data) => request.post(`/portal/orders/${orderId}/si`, data, { silent: true }),
  // E3 运价查询：GET /portal/rates?from=&to=&keyword=
  rates: (params) => request.get('/portal/rates', { params, silent: true }),
};