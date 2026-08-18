const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P3-2 预算明细行：某预算下按 收入/成本 × 费用类别 的预算金额
const BudgetLine = sequelize.define('BudgetLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  budgetId: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' },
  category: { type: DataTypes.STRING(30), allowNull: false },   // 与 FinanceRecord.category 对齐
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }, // 预算金额（计划值）
  currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'CNY' },
  note: { type: DataTypes.STRING(255) },
}, {
  timestamps: true,
  indexes: [{ fields: ['budgetId', 'direction', 'category'], unique: true }],
});

module.exports = BudgetLine;