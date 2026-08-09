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

export const supplierAPI = crud('suppliers');
export const supplierImportAPI = (formData) => request.post('/suppliers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const supplierImportTemplateAPI = () => request.get('/suppliers/import-template', { responseType: 'blob' });