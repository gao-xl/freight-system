import request from './request';

export const hsCodeAPI = {
  search: (params) => request.get('/hs-codes/search', { params }),
  chapters: () => request.get('/hs-codes/chapters'),
};