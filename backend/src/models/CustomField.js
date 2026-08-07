const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// B4 自定义字段定义（二开扩展：公司加字段不改代码）
const CustomField = sequelize.define('CustomField', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bizType: { type: DataTypes.ENUM('order', 'customer', 'booking', 'finance'), allowNull: false }, // 绑定业务类型
  fieldKey: { type: DataTypes.STRING(50), allowNull: false }, // 字段标识 custom_agent
  label: { type: DataTypes.STRING(50), allowNull: false },
  fieldType: { type: DataTypes.ENUM('string', 'number', 'date', 'enum', 'bool'), defaultValue: 'string' },
  options: { type: DataTypes.TEXT }, // enum 可选项 JSON 数组字符串
  required: { type: DataTypes.BOOLEAN, defaultValue: false },
  isList: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否进列表/搜索
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  sort: { type: DataTypes.INTEGER, defaultValue: 10 },
}, { timestamps: true });

module.exports = CustomField;