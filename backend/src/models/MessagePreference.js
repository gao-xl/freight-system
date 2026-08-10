// F6 消息订阅偏好：按用户按分类关闭站内消息与实时提醒
// 语义：absence = 全开（默认启用）；仅当用户关闭某分类时写入 enabled=false 行。
// 分类目录与 MessageRecord.type 对齐：alert 预警 / order 订单 / finance 财务 / approval 审批 / system 系统
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const MessagePreference = sequelize.define('MessagePreference', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, comment: '用户' },
  type: { type: DataTypes.STRING(30), allowNull: false, comment: '消息分类' },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true, comment: '是否启用（仅存 false 关闭项）' },
}, {
  timestamps: true,
  indexes: [
    { unique: true, fields: ['userId', 'type'], name: 'message_pref_user_type' },
  ],
});

module.exports = MessagePreference;