import request from './request';

// F6 统一消息中心
export const messageAPI = {
  list: (params) => request.get('/messages', { params }),
  unreadCount: () => request.get('/messages/unread-count'),
  read: (id) => request.post(`/messages/${id}/read`),
  readAll: () => request.post('/messages/read-all'),
  // 订阅偏好
  getPrefs: () => request.get('/message-preferences'),
  updatePrefs: (prefs) => request.put('/message-preferences', { prefs }),
};