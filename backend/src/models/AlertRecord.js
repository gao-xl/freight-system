const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 预警记录（规则引擎产出，前端预警中心展示）
const AlertRecord = sequelize.define('AlertRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.ENUM('eta_soon', 'vessel_change', 'customs_deadline', 'overdue_receivable', 'cutoff_time', 'manifest', 'blocked'), allowNull: false },
  level: { type: DataTypes.ENUM('info', 'warning', 'danger'), defaultValue: 'warning' },
  orderId: { type: DataTypes.INTEGER },
  bookingId: { type: DataTypes.INTEGER },
  financeId: { type: DataTypes.INTEGER },
  title: { type: DataTypes.STRING(100) },       // 预警标题
  message: { type: DataTypes.TEXT },            // 预警详情
  dueAt: { type: DataTypes.DATE },              // 到期/触发时间
  status: { type: DataTypes.ENUM('active', 'resolved', 'ignored'), defaultValue: 'active' },
  resolvedAt: { type: DataTypes.DATE },
  // 去重键：同一业务对象同类型同批次只保留一条
  dedupKey: { type: DataTypes.STRING(80) },
}, { timestamps: true, indexes: [{ fields: ['status'] }, { fields: ['orderId'] }, { unique: true, fields: ['dedupKey'] }] });

module.exports = AlertRecord;