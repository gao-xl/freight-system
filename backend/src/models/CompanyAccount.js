const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 公司银行账号（收款/付款）
const CompanyAccount = sequelize.define('CompanyAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountName: { type: DataTypes.STRING(120), allowNull: false },  // 户名
  accountNo: { type: DataTypes.STRING(50), allowNull: false },     // 账号
  bankName: { type: DataTypes.STRING(120) },                       // 银行名称
  bankBranch: { type: DataTypes.STRING(200) },                     // 开户行支行
  currency: { type: DataTypes.ENUM('CNY', 'USD', 'EUR', 'HKD', 'JPY', 'OTHER'), defaultValue: 'CNY' },
  accountType: { type: DataTypes.ENUM('receive', 'pay', 'both'), defaultValue: 'receive' }, // 收款/付款
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },     // 默认账号
  status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true });

module.exports = CompanyAccount;