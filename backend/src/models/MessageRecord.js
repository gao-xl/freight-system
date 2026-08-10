// F6 统一消息中心：站内消息记录（按用户归属，支撑未读角标 + 实时推送落库）
// 事件 → messageService 生成消息 → SSE 实时广播 + 前端轮询兜底
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const MessageRecord = sequelize.define('MessageRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // 接收用户（必填，内部员工每人一份；不做全局广播行，避免"已读"语义复杂化）
  userId: { type: DataTypes.INTEGER, allowNull: false, comment: '接收用户' },
  // 消息分类：alert 预警 / approval 审批 / finance 财务 / order 订单 / system 系统
  type: { type: DataTypes.STRING(30), defaultValue: 'system' },
  level: { type: DataTypes.ENUM('info', 'warning', 'danger'), defaultValue: 'info' },
  title: { type: DataTypes.STRING(120) },
  content: { type: DataTypes.TEXT },
  // 业务跳转引用：refType(order/alert/booking/finance) + refId
  refType: { type: DataTypes.STRING(30) },
  refId: { type: DataTypes.INTEGER },
  isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
  readAt: { type: DataTypes.DATE },
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId', 'isRead'] },
    { fields: ['userId', 'createdAt'] },
  ],
});

module.exports = MessageRecord;