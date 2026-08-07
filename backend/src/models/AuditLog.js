const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 操作审计日志（谁、何时、对什么资源做了什么）
const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER },
  username: { type: DataTypes.STRING(50) },
  module: { type: DataTypes.STRING(30) },      // order / finance / system ...
  action: { type: DataTypes.STRING(30) },      // create / update / delete / login
  method: { type: DataTypes.STRING(10) },
  path: { type: DataTypes.STRING(120) },
  targetId: { type: DataTypes.STRING(30) },    // 目标记录 id
  summary: { type: DataTypes.STRING(255) },    // 操作摘要
  ip: { type: DataTypes.STRING(45) },
  userAgent: { type: DataTypes.STRING(255) },
}, { timestamps: true, indexes: [{ fields: ['module'] }, { fields: ['username'] }, { fields: ['createdAt'] }] });

module.exports = AuditLog;