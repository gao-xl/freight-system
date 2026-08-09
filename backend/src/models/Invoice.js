const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 开票记录（财务 B4）
const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  invoiceNo: { type: DataTypes.STRING(50), unique: true, allowNull: false }, // 发票号
  invoiceType: { type: DataTypes.ENUM('payable', 'receivable'), allowNull: false }, // 应付/应收发票
  orderId: { type: DataTypes.INTEGER },
  customerId: { type: DataTypes.INTEGER },      // 应收开票对象
  supplierId: { type: DataTypes.INTEGER },      // 应付开票对象
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  taxRate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 }, // 税率 %
  taxAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }, // 含税总额 = amount + taxAmount
  items: { type: DataTypes.TEXT }, // N2 开票明细行 JSON：[{financeId, description, amount, currency}]
  status: { type: DataTypes.ENUM('draft', 'issued', 'paid', 'cancelled'), defaultValue: 'draft' },
  issuedAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
  createdBy: { type: DataTypes.INTEGER },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['orderId'] }, { fields: ['invoiceNo'] }] });

module.exports = Invoice;