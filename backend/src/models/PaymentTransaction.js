const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// C3 美元支付/汇出交易：对接美元支付通道（如融易达/银行直连）
const PaymentTransaction = sequelize.define('PaymentTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  txNo: { type: DataTypes.STRING(40), allowNull: false, unique: true },   // 交易单号
  channel: { type: DataTypes.STRING(30), defaultValue: 'usd_pay' },
  type: { type: DataTypes.ENUM('outward', 'inward'), defaultValue: 'outward' }, // 汇出/汇入
  financeId: { type: DataTypes.INTEGER },    // 关联费用记录
  orderId: { type: DataTypes.INTEGER },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },           // 交易金额
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  beneficiary: { type: DataTypes.STRING(100) },                           // 收款人
  beneficiaryBank: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.ENUM('draft', 'pending', 'processing', 'success', 'failed', 'cancelled'), defaultValue: 'draft' },
  externalRef: { type: DataTypes.STRING(50) },                            // 通道返回流水号
  error: { type: DataTypes.STRING(255) },
  paidAt: { type: DataTypes.DATE },
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['txNo'] }, { fields: ['orderId'] }] });

module.exports = PaymentTransaction;