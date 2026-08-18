const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 借记通知单（应付对账核心单据）
const DebitNote = sequelize.define('DebitNote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  debitNoteNo: { type: DataTypes.STRING(50), unique: true, allowNull: false },
  supplierId: { type: DataTypes.INTEGER },
  orderId: { type: DataTypes.INTEGER },
  blId: { type: DataTypes.INTEGER },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  taxRate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  taxAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  items: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('draft', 'issued', 'paid', 'cancelled'), defaultValue: 'draft' },
  issuedAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
  createdBy: { type: DataTypes.INTEGER },
  groupId: { type: DataTypes.INTEGER },
  ownerId: { type: DataTypes.INTEGER },
  version: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['orderId'] }, { fields: ['supplierId'] }, { fields: ['blId'] }, { fields: ['debitNoteNo'] }] });

module.exports = DebitNote;