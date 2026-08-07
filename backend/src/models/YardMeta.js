const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 场站名录（静态维护）
const YardMeta = sequelize.define('YardMeta', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), unique: true },  // 场站编码
  name: { type: DataTypes.STRING(50) },                // 场站名称
  mode: { type: DataTypes.ENUM('api', 'scraper', 'manual'), defaultValue: 'manual' },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  remark: { type: DataTypes.TEXT },
}, { timestamps: true });

module.exports = YardMeta;