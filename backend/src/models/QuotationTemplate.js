const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 报价模板：预设费用项，创建报价时一键套用
const QuotationTemplate = sequelize.define('QuotationTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  type: { type: DataTypes.ENUM('import', 'export', 'transit'), defaultValue: 'export' },
  mode: { type: DataTypes.ENUM('sea', 'air', 'land', 'rail'), defaultValue: 'sea' },
  serviceType: { type: DataTypes.ENUM('fcl', 'lcl', 'charter', 'express'), defaultValue: 'fcl' },
  originPort: { type: DataTypes.STRING(50) },
  destPort: { type: DataTypes.STRING(50) },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  items: { type: DataTypes.TEXT }, // JSON: [{name,category,direction,unit,quantity,unitPrice,currency,supplierId}]
  groupId: { type: DataTypes.INTEGER },
  ownerId: { type: DataTypes.INTEGER },
}, { timestamps: true });

module.exports = QuotationTemplate;