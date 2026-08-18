const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// HS编码知识库：中国海关进出口商品编码
const HsCode = sequelize.define('HsCode', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(20), allowNull: false, unique: true }, // 如 "9403.1000"
  name: { type: DataTypes.STRING(500), allowNull: false },              // 商品名称
  chapter: { type: DataTypes.STRING(4) },    // 章节（前2位）
  heading: { type: DataTypes.STRING(6) },    // 品目（前4位）
  exportRate: { type: DataTypes.DECIMAL(6, 4), defaultValue: 0 }, // 出口退税率
  importRate: { type: DataTypes.DECIMAL(6, 4), defaultValue: 0 }, // 进口关税率
  vatRate: { type: DataTypes.DECIMAL(6, 4), defaultValue: 0 },    // 增值税率
  unit: { type: DataTypes.STRING(20) },      // 法定计量单位
  supervision: { type: DataTypes.STRING(100) }, // 监管条件（如 "A/B"）
  isCommon: { type: DataTypes.BOOLEAN, defaultValue: false }, // 常用标记
}, { timestamps: true, indexes: [{ fields: ['code'] }, { fields: ['chapter'] }] });

module.exports = HsCode;