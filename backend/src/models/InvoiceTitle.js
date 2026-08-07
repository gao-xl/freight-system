const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 开票/单证抬头（可作为多个抬头供开票或单证套打选用）
const InvoiceTitle = sequelize.define('InvoiceTitle', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titleName: { type: DataTypes.STRING(120), allowNull: false },  // 抬头名称
  taxNo: { type: DataTypes.STRING(50) },                         // 税号
  address: { type: DataTypes.STRING(255) },                      // 地址
  phone: { type: DataTypes.STRING(50) },                         // 电话
  bankName: { type: DataTypes.STRING(120) },                     // 开户行
  accountNo: { type: DataTypes.STRING(50) },                     // 银行账号
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },   // 默认抬头
  status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true });

module.exports = InvoiceTitle;