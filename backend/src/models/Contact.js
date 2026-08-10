const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P1 客户多联系人：一个客户可维护多个联系人，用于门到门拆段/订舱/财务多对接人
const Contact = sequelize.define('Contact', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },       // 归属客户
  name: { type: DataTypes.STRING(50), allowNull: false },          // 联系人姓名
  position: { type: DataTypes.STRING(50) },                        // 职务
  department: { type: DataTypes.STRING(50) },                      // 部门
  phone: { type: DataTypes.STRING(30) },
  mobile: { type: DataTypes.STRING(30) },
  email: { type: DataTypes.STRING(100) },
  wechat: { type: DataTypes.STRING(50) },
  isPrimary: { type: DataTypes.BOOLEAN, defaultValue: false },     // 是否主联系人
  language: { type: DataTypes.STRING(20), defaultValue: 'cn' },    // 沟通语言
  remark: { type: DataTypes.STRING(255) },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['customerId'] }] });

module.exports = Contact;