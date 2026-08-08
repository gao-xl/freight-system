const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 报关单
const CustomsDeclaration = sequelize.define('CustomsDeclaration', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  declNo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  supplierId: { type: DataTypes.INTEGER }, // 报关行
  type: { type: DataTypes.ENUM('export_clearance', 'import_clearance', 'inspection'), defaultValue: 'export_clearance' },
  status: { type: DataTypes.ENUM('prepared', 'submitted', 'inspecting', 'released', 'rejected', 'closed'), defaultValue: 'prepared' },
  customsNo: { type: DataTypes.STRING(50) },
  hsCode: { type: DataTypes.STRING(20) },
  customsValue: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  inspectionResult: { type: DataTypes.STRING(255) },
  submitDate: { type: DataTypes.DATEONLY },
  releaseDate: { type: DataTypes.DATEONLY },
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
}, { timestamps: true, paranoid: true });

module.exports = CustomsDeclaration;