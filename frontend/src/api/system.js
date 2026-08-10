import request from './request';

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
// 系统审计日志
export const auditLogAPI = (params) => request.get('/system/audit-logs', { params });
// P1 发票号段管理
export const numberSegmentAPI = {
  list: (params) => request.get('/number-segments', { params }),
  create: (data) => request.post('/number-segments', data),
  update: (id, data) => request.put(`/number-segments/${id}`, data),
  remove: (id) => request.delete(`/number-segments/${id}`),
};
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
// 公司信息（引导 Wizard 复用现有接口）
export const companyProfileAPI = {
  get: () => request.get('/company/profile'),
  save: (data) => request.put('/company/profile', data),
};