const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 客户跟进记录（CRM）
const CustomerFollow = sequelize.define('CustomerFollow', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  operatorId: { type: DataTypes.INTEGER, allowNull: false },  // 跟进人
  type: { type: DataTypes.ENUM('call', 'visit', 'email', 'wechat', 'quotation', 'order', 'meeting', 'other'), defaultValue: 'call' },
  content: { type: DataTypes.TEXT, allowNull: false },        // 跟进内容
  nextFollowAt: { type: DataTypes.DATE },                     // 下次跟进时间
  status: { type: DataTypes.ENUM('open', 'done'), defaultValue: 'done' }, // done=已跟进闭环
}, { timestamps: true, indexes: [{ fields: ['customerId'] }, { fields: ['operatorId'] }, { fields: ['nextFollowAt'] }] });

module.exports = CustomerFollow;