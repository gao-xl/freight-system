const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 费用/财务流水（应收/应付）
const FinanceRecord = sequelize.define('FinanceRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.ENUM('receivable', 'payable'), allowNull: false },
  category: { type: DataTypes.ENUM('ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other'), defaultValue: 'other' },
  description: { type: DataTypes.STRING(255) },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  rate: { type: DataTypes.DECIMAL(10, 4), defaultValue: 1 }, // 汇率
  status: { type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'waived'), defaultValue: 'unpaid' },
  counterpartyId: { type: DataTypes.INTEGER }, // 客户或供应商
  invoiceNo: { type: DataTypes.STRING(50) },
  paidAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  dueDate: { type: DataTypes.DATEONLY },
  paidAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  customFields: { type: DataTypes.TEXT },   // B4 自定义字段扩展（JSON 字符串）
}, { timestamps: true });

module.exports = FinanceRecord;