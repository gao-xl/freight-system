const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 供应商（船公司/航空公司/报关行/车队等）
const Supplier = sequelize.define('Supplier', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  category: { type: DataTypes.ENUM('carrier', 'airline', 'customs_broker', 'truck', 'warehouse', 'other'), defaultValue: 'carrier' },
  contact: { type: DataTypes.STRING(50) },
  phone: { type: DataTypes.STRING(30) },
  email: { type: DataTypes.STRING(100) },
  address: { type: DataTypes.STRING(255) },
  ports: { type: DataTypes.STRING(255) }, // 主营航线/港口
  contractNo: { type: DataTypes.STRING(50) },
  paymentTerms: { type: DataTypes.STRING(100) },
  remark: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
}, { timestamps: true });

module.exports = Supplier;