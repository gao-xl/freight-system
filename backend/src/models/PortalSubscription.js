const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P2-4 客户门户通知订阅：客户门户内订阅某类通知的推送渠道偏好
// 说明：MessagePreference 按 userId+type 只控站内消息开关，不区分出站渠道；
// 本模型按 客户 + 事件类别 + 渠道 记录订阅开关，用于客户门户「通知订阅」页。
const PortalSubscription = sequelize.define('PortalSubscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },    // 归属客户
  category: { type: DataTypes.STRING(30), allowNull: false },   // order/track/bill/customs
  channel: { type: DataTypes.STRING(30), allowNull: false },    // email/wechat_mp
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // 客户侧可指定收件邮箱（默认取 Customer 档案邮箱）
  email: { type: DataTypes.STRING(120) },
}, {
  timestamps: true,
  indexes: [{ fields: ['customerId', 'category', 'channel'], unique: true }],
});

module.exports = PortalSubscription;