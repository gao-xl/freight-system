const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// E2 通知推送记录：每次实际出站推送（邮件/企微/通用 Webhook）的结果落库，供管理端查询
// 约定：仅"已配置且启用"的渠道尝试推送并落库；渠道缺配置/未启用时静默跳过，不产生记录。
const NotificationRecord = sequelize.define('NotificationRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // 触发事件：alert.created / alert.resolved / order.created ...
  eventType: { type: DataTypes.STRING(50), allowNull: false },
  // 业务对象类型与主键：alert / order / finance ...
  targetType: { type: DataTypes.STRING(50), defaultValue: 'alert' },
  targetId: { type: DataTypes.INTEGER },
  // 渠道：email / wechat_webhook / webhook
  channel: { type: DataTypes.STRING(30), allowNull: false },
  // 推送结果：sent 成功 / failed 失败（不抛致命错误）
  status: { type: DataTypes.ENUM('sent', 'failed'), defaultValue: 'sent' },
  // 失败原因（成功为空）
  error: { type: DataTypes.STRING(500) },
  // 推送内容摘要（JSON 字符串，防 payload 过大）
  payload: { type: DataTypes.TEXT },
  sentAt: { type: DataTypes.DATE },
}, {
  timestamps: true,
  indexes: [
    { fields: ['eventType'] },
    { fields: ['channel'] },
    { fields: ['status'] },
    { fields: ['targetType', 'targetId'] },
  ],
});

module.exports = NotificationRecord;
