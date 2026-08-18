const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P3-2 预算调整审批：对预算额度的增减调整，保留审批历史与原因
const BudgetAdjustment = sequelize.define('BudgetAdjustment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  budgetId: { type: DataTypes.INTEGER, allowNull: false },
  direction: { type: DataTypes.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' },
  category: { type: DataTypes.STRING(30), allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },  // 调整额（可为负，表示调减）
  reason: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
  requestedBy: { type: DataTypes.INTEGER },
  requestedAt: { type: DataTypes.DATE },
  approvedBy: { type: DataTypes.INTEGER },
  approvedAt: { type: DataTypes.DATE },
  rejectReason: { type: DataTypes.STRING(255) },
}, {
  timestamps: true,
  indexes: [{ fields: ['budgetId', 'status'] }],
});

module.exports = BudgetAdjustment;