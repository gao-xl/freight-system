const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 账期（结账/扎帐/锁帐）
// 按自然月划分财务核算区间，结账时写入汇总快照并封存，锁账后禁止写操作
const AccountingPeriod = sequelize.define('AccountingPeriod', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  periodCode: { type: DataTypes.STRING(7), allowNull: false, unique: true }, // 账期号，如 2026-08
  year: { type: DataTypes.INTEGER, allowNull: false },
  month: { type: DataTypes.INTEGER, allowNull: false },
  startDate: { type: DataTypes.DATEONLY },
  endDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.ENUM('open', 'closed', 'locked'), defaultValue: 'open' },
  // 结账汇总快照
  receivable: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  payable: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  received: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  paid: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  profit: { type: DataTypes.DECIMAL(11, 2), defaultValue: 0 },
  // 结账信息
  closedBy: { type: DataTypes.INTEGER },
  closedAt: { type: DataTypes.DATE },
  closeNote: { type: DataTypes.TEXT },
  // 锁账信息
  lockedBy: { type: DataTypes.INTEGER },
  lockedAt: { type: DataTypes.DATE },
  lockNote: { type: DataTypes.TEXT },
  // 解锁信息（原因必填）
  unlockedBy: { type: DataTypes.INTEGER },
  unlockedAt: { type: DataTypes.DATE },
  unlockReason: { type: DataTypes.TEXT },
}, { timestamps: true, indexes: [{ fields: ['periodCode'] }, { fields: ['year', 'month'] }] });

module.exports = AccountingPeriod;