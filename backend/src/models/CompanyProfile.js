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
  security2faEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // S4 2FA 总开关
  securityEmailEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // S4 邮箱验证码通道开关
  securityTotpEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // S4 TOTP 通道开关
  smtpHost: { type: DataTypes.STRING(100), allowNull: true }, // S4 SMTP 服务器（优先于环境变量）
  smtpPort: { type: DataTypes.INTEGER, allowNull: true }, // S4 SMTP 端口（465 SSL / 587 STARTTLS）
  smtpUser: { type: DataTypes.STRING(100), allowNull: true }, // S4 SMTP 账号
  smtpPassEnc: { type: DataTypes.STRING(255), allowNull: true }, // S4 SMTP 密码（AES 加密）
  smtpFrom: { type: DataTypes.STRING(120), allowNull: true }, // S4 SMTP 发件人
}, { timestamps: true });

module.exports = CompanyProfile;