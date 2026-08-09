const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// N3 收款/付款单：按客户登记一笔款项，分摊核销多张费用，联动发票状态
const PaymentRecord = sequelize.define('PaymentRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(40), unique: true, allowNull: false }, // REC/PAY 单号
  direction: { type: DataTypes.ENUM('received', 'paid'), allowNull: false }, // 收款/付款
  customerId: { type: DataTypes.INTEGER },      // 收款对象（客户）
  supplierId: { type: DataTypes.INTEGER },      // 付款对象（供应商）
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },  // 到账金额
  currency: { type: DataTypes.STRING(10), defaultValue: 'CNY' },
  paidAt: { type: DataTypes.DATEONLY },         // 到账日期
  appliedCount: { type: DataTypes.INTEGER, defaultValue: 0 },    // 已核销费用条数
  appliedAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }, // 已核销金额
  remark: { type: DataTypes.STRING(500) },
  groupId: { type: DataTypes.INTEGER },
  ownerId: { type: DataTypes.INTEGER },
  version: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: true });

module.exports = PaymentRecord;
