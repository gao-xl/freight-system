import request from './request';

// 认证
export const loginAPI = (data) => request.post('/auth/login', data);
export const meAPI = () => request.get('/auth/me');
export const changePasswordAPI = (data) => request.post('/auth/change-password', data);

// 看板
export const dashboardAPI = () => request.get('/dashboard');
export const orderStatusDistAPI = () => request.get('/dashboard/order-status');
export const modeDistAPI = () => request.get('/dashboard/mode-dist');
export const recentOrdersAPI = (limit = 8) => request.get(`/dashboard/recent-orders?limit=${limit}`);
export const dashboardMetricsAPI = () => request.get('/dashboard/metrics');
export const dashboardAgingAPI = () => request.get('/dashboard/aging');
export const salesPerformanceAPI = () => request.get('/dashboard/sales-performance');

// 通用 CRUD 工厂
const crud = (resource) => ({
  list: (params) => request.get(`/${resource}`, { params }),
  get: (id) => request.get(`/${resource}/${id}`),
  create: (data) => request.post(`/${resource}`, data),
  update: (id, data) => request.put(`/${resource}/${id}`, data),
  remove: (id) => request.delete(`/${resource}/${id}`),
  // 批量删除：POST /:resource/batch-delete { ids }
  batchRemove: (ids) => request.post(`/${resource}/batch-delete`, { ids }),
  // 批量更新：POST /:resource/batch-update { ids, data }
  batchUpdate: (ids, data) => request.post(`/${resource}/batch-update`, { ids, data }),
  // U5 回收站：恢复软删除记录
  restore: (id) => request.post(`/${resource}/${id}/restore`),
});

export const customerAPI = crud('customers');
export const customerStatsAPI = () => request.get('/customers/stats');
export const customerPendingFollowsAPI = () => request.get('/customers/pending-follows');
export const customerImportAPI = (formData) => request.post('/customers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const customerImportTemplateAPI = () => request.get('/customers/import-template', { responseType: 'blob' });
export const customerFollowsAPI = (id) => request.get(`/customers/${id}/follows`);
export const createCustomerFollowAPI = (id, data) => request.post(`/customers/${id}/follows`, data);
export const updateCustomerFollowAPI = (followId, data) => request.put(`/customers/follows/${followId}`, data);
export const deleteCustomerFollowAPI = (followId) => request.delete(`/customers/follows/${followId}`);
export const supplierAPI = crud('suppliers');
export const supplierImportAPI = (formData) => request.post('/suppliers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const supplierImportTemplateAPI = () => request.get('/suppliers/import-template', { responseType: 'blob' });
export const orderAPI = crud('orders');
export const orderDetailAPI = (id) => request.get(`/orders/${id}/detail`);
export const orderTimelineAPI = (id) => request.get(`/orders/${id}/timeline`);
export const orderFlowAPI = (id) => request.get(`/orders/${id}/flow`);
export const orderAdvanceAPI = (id, node) => request.post(`/orders/${id}/advance`, { node });
export const orderBatchAdvanceAPI = (ids, node) => request.post(`/orders/batch-advance`, { ids, node });
export const orderBatchStatusAPI = (ids, status) => request.post(`/orders/batch-status`, { ids, status });
// B3 进出口流程节点
export const flowNodesAPI = (bizType) => request.get('/flow-nodes', { params: { bizType } });
export const updateFlowNodeAPI = (id, data) => request.put(`/flow-nodes/${id}`, data);
export const orderNodesAPI = (id) => request.get(`/orders/${id}/nodes`);
export const updateOrderNodeAPI = (id, nodeCode, data) => request.put(`/orders/${id}/nodes/${nodeCode}`, data);
export const flowStatsAPI = () => request.get('/flow-stats');
// C6 一单多箱
export const orderContainersAPI = (orderId) => request.get(`/orders/${orderId}/containers`);
export const saveOrderContainersAPI = (orderId, data) => request.put(`/orders/${orderId}/containers`, data);
// C5 客户自助门户
export const portalAPI = {
  overview: () => request.get('/portal/overview'),
  orders: (params) => request.get('/portal/orders', { params }),
  bills: (params) => request.get('/portal/bills', { params }),
  orderDetail: (id) => request.get(`/portal/orders/${id}`),
};
export const bookingAPI = crud('bookings');
export const customsAPI = crud('customs');
export const documentAPI = crud('documents');
export const documentSearchAPI = (q) => request.get('/documents/search', { params: { q } });
export const documentGenerateAPI = (params) => request.get('/documents/generate', { params });
export const documentChangeStatusAPI = (id, to) => request.post(`/documents/${id}/status`, { to });
export const documentUploadAPI = (id, formData) => request.post(`/documents/${id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const documentDownloadAPI = (id) => request.get(`/documents/${id}/download`, { responseType: 'blob' });
export const documentPreviewAPI = (id) => request.get(`/documents/${id}/file`, { responseType: 'blob' });
export const trackAPI = crud('tracks');
export const financeAPI = { ...crud('finance'), currencySummary: (p) => request.get('/finance/currency-summary', { params: p }), creditCheck: (id, p) => request.get(`/finance/customers/${id}/credit`, { params: p }) };
export const financeSummaryAPI = () => request.get('/finance/summary');
export const financeTrendAPI = (year) => request.get(`/finance/monthly-trend?year=${year}`);
export const integrationAPI = crud('integrations');
export const integrationRegistryAPI = () => request.get('/integrations/registry');
export const integrationTriggerAPI = (data) => request.post('/integrations/trigger', data);
export const quotationAPI = {
  list: (params) => request.get('/quotations', { params }),
  get: (id) => request.get(`/quotations/${id}`),
  create: (data) => request.post('/quotations', data),
  update: (id, data) => request.put(`/quotations/${id}`, data),
  remove: (id) => request.delete(`/quotations/${id}`),
  send: (id) => request.post(`/quotations/${id}/send`),
  confirm: (id) => request.post(`/quotations/${id}/confirm`),
  convertOrder: (id, data) => request.post(`/quotations/${id}/convert-order`, data),
  stats: () => request.get('/quotations/stats'),
};
// 系统管理（RBAC）
export const roleAPI = {
  list: () => request.get('/roles'),
  create: (data) => request.post('/roles', data),
  update: (id, data) => request.put(`/roles/${id}`, data),
  remove: (id) => request.delete(`/roles/${id}`),
  assignPermissions: (id, permissionIds) => request.put(`/roles/${id}/permissions`, { permissionIds }),
};
export const permissionAPI = () => request.get('/permissions');
export const userAPI = {
  list: () => request.get('/users'),
  create: (data) => request.post('/users', data),
  update: (id, data) => request.put(`/users/${id}`, data),
  remove: (id) => request.delete(`/users/${id}`),
  assignRoles: (id, roleIds) => request.put(`/users/${id}/roles`, { roleIds }),
};
// B2 小组管理（数据权限）
export const groupAPI = {
  list: () => request.get('/groups'),
  get: (id) => request.get(`/groups/${id}`),
  create: (data) => request.post('/groups', data),
  update: (id, data) => request.put(`/groups/${id}`, data),
  remove: (id) => request.delete(`/groups/${id}`),
  members: () => request.get('/groups/members'),
  addMember: (id, userId) => request.post(`/groups/${id}/members`, { userId }),
  removeMember: (id, userId) => request.delete(`/groups/${id}/members/${userId}`),
};
// B4 自定义字段
export const customFieldAPI = {
  list: (bizType) => request.get('/custom-fields', { params: { bizType } }),
  create: (data) => request.post('/custom-fields', data),
  update: (id, data) => request.put(`/custom-fields/${id}`, data),
  remove: (id) => request.delete(`/custom-fields/${id}`),
};
// 青岛港专项
export const qingdaoAPI = {
  nodes: (orderId) => request.get('/qingdao/nodes', { params: { orderId } }),
  updateNode: (data) => request.post('/qingdao/nodes', data),
  checklist: () => request.get('/qingdao/checklist'),
  alerts: (terminal = '') => request.get('/qingdao/alerts', { params: { terminal } }),
  manifestCheck: (bookingId) => request.get('/qingdao/manifest/check', { params: { bookingId } }),
};
// 预警中心
export const alertAPI = {
  list: (params) => request.get('/alerts', { params }),
  run: () => request.post('/alerts/run'),
  resolve: (id) => request.post(`/alerts/${id}/resolve`),
  ignore: (id) => request.post(`/alerts/${id}/ignore`),
};
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
// 系统审计日志
export const auditLogAPI = (params) => request.get('/system/audit-logs', { params });
// 公司设置（公司信息/部门/银行账号/开票抬头）
export const companyAPI = {
  profile: () => request.get('/company/profile'),
  saveProfile: (data) => request.put('/company/profile', data),
  departments: () => request.get('/departments'),
  createDepartment: (data) => request.post('/departments', data),
  updateDepartment: (id, data) => request.put(`/departments/${id}`, data),
  removeDepartment: (id) => request.delete(`/departments/${id}`),
  accounts: () => request.get('/company-accounts'),
  createAccount: (data) => request.post('/company-accounts', data),
  updateAccount: (id, data) => request.put(`/company-accounts/${id}`, data),
  removeAccount: (id) => request.delete(`/company-accounts/${id}`),
  titles: () => request.get('/invoice-titles'),
  createTitle: (data) => request.post('/invoice-titles', data),
  updateTitle: (id, data) => request.put(`/invoice-titles/${id}`, data),
  removeTitle: (id) => request.delete(`/invoice-titles/${id}`),
};
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
// 导出（U2：订单导出携带当前筛选条件，导出=所见）
export const orderExportAPI = (params) => request.get('/orders/export', { params, responseType: 'blob' });
export const financeExportAPI = () => request.get('/finance/export', { responseType: 'blob' });

// 待办任务中心（A4）
export const todoAPI = () => request.get('/tasks/todo');

// 财务对账/开票/核销（B4）
export const financeReconcileAPI = (params) => request.get('/finance/reconcile', { params });
export const invoiceAPI = {
  list: (params) => request.get('/finance/invoices', { params }),
  create: (data) => request.post('/finance/invoices', data),
  issue: (id) => request.post(`/finance/invoices/${id}/issue`),
  cancel: (id) => request.post(`/finance/invoices/${id}/cancel`),
};
export const financeWriteoffAPI = (id, data) => request.post(`/finance/${id}/writeoff`, data);
export const financeBatchWriteoffAPI = (ids, amount) => request.post('/finance/batch-writeoff', { ids, amount });

// 结账/扎帐/锁帐：账期管理
export const financePeriodsAPI = (year) => request.get('/finance/periods', { params: { year } });
export const financeEnsurePeriodsAPI = () => request.post('/finance/periods/ensure');
export const financeClosePeriodAPI = (code, data) => request.post(`/finance/periods/${code}/close`, data);
export const financeLockPeriodAPI = (code, data) => request.post(`/finance/periods/${code}/lock`, data);
export const financeUnlockPeriodAPI = (code, data) => request.post(`/finance/periods/${code}/unlock`, data);
export const financePeriodStatementAPI = (code) => request.get(`/finance/periods/${code}/statement`);

// P2.3 Excel 批量导入（统一入口：customer/supplier/order）
export const importTemplateAPI = (biz) => request.get(`/import/templates/${biz}`, { responseType: 'blob' });
export const importFileAPI = (biz, formData) => request.post(`/import/${biz}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
// P2.4 对账单：GET /finance/statement?customerId=&month=YYYY-MM
export const financeStatementAPI = (params) => request.get('/finance/statement', { params });

// 单票毛利（B6）
export const orderProfitAPI = (id) => request.get(`/orders/${id}/profit`);
export const orderProfitSummaryAPI = (params) => request.get('/orders/profit-summary', { params });

// 放单控制（B8）
export const releaseAPI = {
  list: (params) => request.get('/release', { params }),
  records: (orderId) => request.get(`/release/orders/${orderId}`),
  apply: (orderId, data) => request.post(`/orders/${orderId}/release`, data),
  approve: (id, data) => request.post(`/release/${id}/approve`, data),
};
// ============ Onboarding 引导系统 ============
export const initStatusAPI = () => request.get('/system/init-status');
export const setupAdminAPI = (data) => request.post('/system/setup-admin', data);
export const createDemoDataAPI = () => request.post('/system/demo-data');
export const clearDemoDataAPI = () => request.delete('/system/demo-data');
// 公司信息（引导 Wizard 复用现有接口）
export const companyProfileAPI = {
  get: () => request.get('/company/profile'),
  save: (data) => request.put('/company/profile', data),
};
