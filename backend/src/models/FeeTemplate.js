const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// N1 费用模板：常用费用组合（如"海出整箱基础费"= 海运费+文件费+订舱费...）
// items: JSON 数组 [{ direction, category, description, amount, currency }]
const FeeTemplate = sequelize.define('FeeTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  items: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' }, // JSON 数组
  remark: { type: DataTypes.STRING(255) },
  groupId: { type: DataTypes.INTEGER },
  ownerId: { type: DataTypes.INTEGER },
  version: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: true });

module.exports = FeeTemplate;
