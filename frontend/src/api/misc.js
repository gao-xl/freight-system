import request from './request';

// 场站信息查询
export const yardAPI = {
  list: () => request.get('/yards'),
  status: (params) => request.get('/yards/status', { params }),
  query: (data) => request.post('/yards/query', data),
  records: (params) => request.get('/yards/records', { params }),
  create: (data) => request.post('/yards', data),
  update: (id, data) => request.put(`/yards/${id}`, data),
  remove: (id) => request.delete(`/yards/${id}`),
  manualCreate: (data) => request.post('/yards/records', data),
};

// 免费第三方外部API
export const externalAPI = {
  vessel: (mmsi) => request.get(`/external/vessel/${mmsi}`),
  schedule: (params) => request.get('/external/schedule', { params }),
  rate: (params) => request.get('/external/rate', { params }),
};

// 青岛港专项
export const qingdaoAPI = {
  nodes: (orderId) => request.get('/qingdao/nodes', { params: { orderId } }),
  updateNode: (data) => request.post('/qingdao/nodes', data),
  checklist: () => request.get('/qingdao/checklist'),
  alerts: (terminal = '') => request.get('/qingdao/alerts', { params: { terminal } }),
  manifestCheck: (bookingId) => request.get('/qingdao/manifest/check', { params: { bookingId } }),
};

// 打印模板
export const printTemplateAPI = {
  list: (params) => request.get('/print-templates', { params }),
  get: (id) => request.get(`/print-templates/${id}`),
  create: (data) => request.post('/print-templates', data),
  update: (id, data) => request.put(`/print-templates/${id}`, data),
  remove: (id) => request.delete(`/print-templates/${id}`),
  copy: (id) => request.post(`/print-templates/${id}/copy`),
  setDefault: (id) => request.put(`/print-templates/${id}/default`),
  fields: (docType) => request.get(`/print-templates/fields/${docType}`),
  preview: (id, data) => request.post(`/print-templates/${id}/preview`, data),
};
export const printAPI = (docType, bizId, params) => request.get(`/print/${docType}/${bizId}`, { params, responseType: 'blob' });

// P2.3 Excel 批量导入（统一入口：customer/supplier/order）
export const importTemplateAPI = (biz) => request.get(`/import/templates/${biz}`, { responseType: 'blob' });
export const importFileAPI = (biz, formData) => request.post(`/import/${biz}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });