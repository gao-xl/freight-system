import request from './request';

const crud = (resource) => ({
  list: (params) => request.get(`/${resource}`, { params }),
  get: (id) => request.get(`/${resource}/${id}`),
  create: (data) => request.post(`/${resource}`, data),
  update: (id, data) => request.put(`/${resource}/${id}`, data),
  remove: (id) => request.delete(`/${resource}/${id}`),
  restore: (id) => request.post(`/${resource}/${id}/restore`),
  batchRemove: (ids) => request.post(`/${resource}/batch-delete`, { ids }),
  batchUpdate: (ids, data) => request.post(`/${resource}/batch-update`, { ids, ...data }),
});

export const billOfLadingAPI = {
  ...crud('bills-of-lading'),
  houseBls: (masterId) => request.get(`/bills-of-lading/${masterId}/house-bls`),
  byOrder: (orderId) => request.get(`/orders/${orderId}/bills-of-lading`),
};