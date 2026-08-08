const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// Onboarding 示例数据批次表（对应 migration 0017 DemoDataLogs）
// 记录示例数据生成批次；清空时按批次标记 isCleared=true 保留审计，不物理删除批次记录
const DemoDataLog = sequelize.define('DemoDataLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  batchId: { type: DataTypes.STRING(64), allowNull: false, unique: true }, // 批次号，如 demo-20260808-153000-123
  isCleared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { timestamps: true });

module.exports = DemoDataLog;
