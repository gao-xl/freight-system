import request from './request';

const crud = (resource) => ({
  list: (params) => request.get(`/${resource}`, { params }),
  get: (id) => request.get(`/${resource}/${id}`),
  create: (data) => request.post(`/${resource}`, data),
  update: (id, data) => request.put(`/${resource}/${id}`, data),
  remove: (id) => request.delete(`/${resource}/${id}`),
  restore: (id) => request.post(`/${resource}/${id}/restore`),
});

export const integrationAPI = crud('integrations');
export const integrationRegistryAPI = () => request.get('/integrations/registry');
export const integrationTriggerAPI = (data) => request.post('/integrations/trigger', data);