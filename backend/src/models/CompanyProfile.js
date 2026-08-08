const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 公司基本信息（单行配置，id=1）
const CompanyProfile = sequelize.define('CompanyProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  companyName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' }, // 公司全称
  shortName: { type: DataTypes.STRING(60), defaultValue: '' },                       // 公司简称
  enName: { type: DataTypes.STRING(200), defaultValue: '' },                         // 英文名称
  legalPerson: { type: DataTypes.STRING(50), defaultValue: '' },                     // 法定代表人
  taxNo: { type: DataTypes.STRING(50), defaultValue: '' },                           // 统一社会信用代码
  address: { type: DataTypes.STRING(255), defaultValue: '' },                        // 注册地址
  phone: { type: DataTypes.STRING(50), defaultValue: '' },                           // 联系电话
  fax: { type: DataTypes.STRING(50), defaultValue: '' },                             // 传真
  email: { type: DataTypes.STRING(100), defaultValue: '' },                          // 邮箱
  website: { type: DataTypes.STRING(100), defaultValue: '' },                        // 官网
  description: { type: DataTypes.TEXT },                                              // 公司简介
  defaultCurrency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'CNY' }, // 默认币种（ISO 4217，向导第 3 步数据源）
}, { timestamps: true });

module.exports = CompanyProfile;