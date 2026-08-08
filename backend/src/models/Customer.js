const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 客户档案
const Customer = sequelize.define('Customer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  shortName: { type: DataTypes.STRING(50) },
  type: { type: DataTypes.ENUM('shipper', 'consignee', 'forwarder', 'importer', 'exporter', 'other'), defaultValue: 'shipper' },
  level: { type: DataTypes.ENUM('A', 'B', 'C', 'D'), defaultValue: 'B' },
  contact: { type: DataTypes.STRING(50) },
  phone: { type: DataTypes.STRING(30) },
  email: { type: DataTypes.STRING(100) },
  address: { type: DataTypes.STRING(255) },
  creditLimit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  businessScope: { type: DataTypes.STRING(255) },
  taxNo: { type: DataTypes.STRING(50) },
  remark: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  lastFollowAt: { type: DataTypes.DATE },   // 最近跟进时间
  nextFollowAt: { type: DataTypes.DATE },   // 下次跟进时间
  customFields: { type: DataTypes.TEXT },   // B4 自定义字段扩展（JSON 字符串）
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
}, { timestamps: true, paranoid: true });

module.exports = Customer;