import request from './request';

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