import request from './request';

// 预警中心
export const alertAPI = {
  list: (params) => request.get('/alerts', { params }),
  run: () => request.post('/alerts/run'),
  resolve: (id) => request.post(`/alerts/${id}/resolve`),
  ignore: (id) => request.post(`/alerts/${id}/ignore`),
};
// 待办任务中心（A4）
export const todoAPI = () => request.get('/tasks/todo');