const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 汇率表（每日刷新，多币种换算基础）
const ExchangeRate = sequelize.define('ExchangeRate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  baseCurrency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  targetCurrency: { type: DataTypes.STRING(10) },
  rate: { type: DataTypes.DECIMAL(20, 6) },
  rateDate: { type: DataTypes.DATEONLY },
}, { timestamps: true, indexes: [{ unique: true, fields: ['baseCurrency', 'targetCurrency', 'rateDate'] }] });

module.exports = ExchangeRate;