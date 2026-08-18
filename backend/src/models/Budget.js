const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P3-2 预算编制表头：按 年度/季度/月度 维度、按部门与数据小组做预算
const Budget = sequelize.define('Budget', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false },       // 预算名称，如「2026年度收入预算」
  year: { type: DataTypes.INTEGER, allowNull: false },           // 预算年度
  periodType: { type: DataTypes.ENUM('year', 'quarter', 'month'), allowNull: false, defaultValue: 'year' },
  period: { type: DataTypes.STRING(16), allowNull: false },      // '2026' | '2026-Q1' | '2026-08'
  departmentId: { type: DataTypes.INTEGER, allowNull: true },    // 目标部门（可选）
  direction: { type: DataTypes.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' }, // 收入/成本预算
  status: { type: DataTypes.ENUM('draft', 'approved', 'closed'), allowNull: false, defaultValue: 'draft' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },   // 调整后递增
  description: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组；实际执行按该小组财务数据聚合
  ownerId: { type: DataTypes.INTEGER },     // 创建人
  creatorId: { type: DataTypes.INTEGER },   // 编制人（历史留痕）
}, {
  timestamps: true,
  indexes: [{ fields: ['year', 'periodType'] }, { fields: ['departmentId'] }, { fields: ['status'] }],
});

module.exports = Budget;