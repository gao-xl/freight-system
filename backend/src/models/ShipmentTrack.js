const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 运输跟踪节点
const ShipmentTrack = sequelize.define('ShipmentTrack', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  bookingId: { type: DataTypes.INTEGER },
  stage: { type: DataTypes.ENUM('booked', 'picked_up', 'received', 'loaded', 'in_transit', 'arrived', 'cleared', 'delivered'), defaultValue: 'booked' },
  location: { type: DataTypes.STRING(100) },
  description: { type: DataTypes.STRING(255) },
  eventTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  operator: { type: DataTypes.STRING(50) },
  remark: { type: DataTypes.TEXT },
  auto: { type: DataTypes.BOOLEAN, defaultValue: false }, // true=系统自动生成，false=人工录入
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
}, { timestamps: true });

module.exports = ShipmentTrack;