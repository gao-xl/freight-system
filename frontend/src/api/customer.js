import request from './request';

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

export const customerAPI = crud('customers');
export const customerOverviewAPI = (id) => request.get(`/customers/${id}/overview`); // N4 客户360°
export const customerStatsAPI = () => request.get('/customers/stats');
export const customerPendingFollowsAPI = () => request.get('/customers/pending-follows');
export const customerImportAPI = (formData) => request.post('/customers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const customerImportTemplateAPI = () => request.get('/customers/import-template', { responseType: 'blob' });
export const customerFollowsAPI = (id) => request.get(`/customers/${id}/follows`);
export const createCustomerFollowAPI = (id, data) => request.post(`/customers/${id}/follows`, data);
export const updateCustomerFollowAPI = (followId, data) => request.put(`/customers/follows/${followId}`, data);
export const deleteCustomerFollowAPI = (followId) => request.delete(`/customers/follows/${followId}`);
// P1 客户多联系人
export const customerContactsAPI = (id) => request.get(`/customers/${id}/contacts`);
export const createCustomerContactAPI = (id, data) => request.post(`/customers/${id}/contacts`, data);
export const updateCustomerContactAPI = (contactId, data) => request.put(`/customers/contacts/${contactId}`, data);
export const deleteCustomerContactAPI = (contactId) => request.delete(`/customers/contacts/${contactId}`);
// P1 客户附件
export const customerAttachmentsAPI = (id) => request.get(`/customers/${id}/attachments`);
export const createCustomerAttachmentAPI = (id, formData) => request.post(`/customers/${id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const customerAttachmentDownloadAPI = (attachId) => request.get(`/customers/attachments/${attachId}/download`, { responseType: 'blob' });
export const deleteCustomerAttachmentAPI = (attachId) => request.delete(`/customers/attachments/${attachId}`);