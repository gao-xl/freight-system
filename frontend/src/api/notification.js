import request from './request';

// F3-1/F3-2 通知渠道配置（企微 Webhook 等出站渠道）
export const notificationAPI = {
  // 读取当前通知配置
  getConfig: () => request.get('/plugins/notification/config'),
  // 保存通知配置 { webhookUrl, enabled, remark }
  saveConfig: (data) => request.put('/plugins/notification/config', data),
  // 测试推送 { channel?, content? }
  test: (data) => request.post('/plugins/notification/test', data),
};
