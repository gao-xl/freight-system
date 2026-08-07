const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 报价明细/费用项
const QuotationItem = sequelize.define('QuotationItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quotationId: { type: DataTypes.INTEGER, allowNull: false },  // 所属报价单
  name: { type: DataTypes.STRING(100), allowNull: false },     // 费用名称
  category: { type: DataTypes.ENUM('ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other'), defaultValue: 'other' },
  direction: { type: DataTypes.ENUM('revenue', 'cost'), defaultValue: 'revenue' }, // 收入/成本
  unit: { type: DataTypes.STRING(20) },        // 计费单位
  quantity: { type: DataTypes.DECIMAL(12, 2), defaultValue: 1 },
  unitPrice: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },  // = quantity * unitPrice
  costPrice: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }, // 成本价
  supplierId: { type: DataTypes.INTEGER },      // 关联成本来源供应商
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: true });

module.exports = QuotationItem;