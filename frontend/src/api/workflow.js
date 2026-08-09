import request from './request';

// P3.1 业务规则引擎（DB 化）
export const businessRuleAPI = {
  list: (params) => request.get('/business-rules', { params }),
  meta: () => request.get('/business-rules/meta'),
  create: (data) => request.post('/business-rules', data),
  update: (id, data) => request.put(`/business-rules/${id}`, data),
  remove: (id) => request.delete(`/business-rules/${id}`),
  test: (id) => request.post(`/business-rules/${id}/test`),
};

// P3.2 流程状态机配置化
export const workflowAPI = {
  list: (params) => request.get('/workflow/configs', { params }),
  statusOptions: () => request.get('/workflow/status-options'),
  create: (data) => request.post('/workflow/configs', data),
  update: (id, data) => request.put(`/workflow/configs/${id}`, data),
  remove: (id) => request.delete(`/workflow/configs/${id}`),
  transition: (data) => request.post('/workflow/transition', data),
};

// P3.3 自定义报表
export const reportAPI = {
  meta: () => request.get('/reports/meta'),
  list: (params) => request.get('/reports', { params }),
  create: (data) => request.post('/reports', data),
  update: (id, data) => request.put(`/reports/${id}`, data),
  remove: (id) => request.delete(`/reports/${id}`),
  run: (id) => request.post(`/reports/${id}/run`),
};