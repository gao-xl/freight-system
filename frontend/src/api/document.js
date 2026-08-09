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

export const documentAPI = crud('documents');
export const documentSearchAPI = (q) => request.get('/documents/search', { params: { q } });
export const documentGenerateAPI = (params) => request.get('/documents/generate', { params });
export const documentChangeStatusAPI = (id, to) => request.post(`/documents/${id}/status`, { to });
export const documentUploadAPI = (id, formData) => request.post(`/documents/${id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const documentDownloadAPI = (id) => request.get(`/documents/${id}/download`, { responseType: 'blob' });
export const documentPreviewAPI = (id) => request.get(`/documents/${id}/file`, { responseType: 'blob' });