const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 订舱单
const Booking = sequelize.define('Booking', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bookingNo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  supplierId: { type: DataTypes.INTEGER }, // 承运人
  vesselName: { type: DataTypes.STRING(80) },
  voyageNo: { type: DataTypes.STRING(40) },
  flightNo: { type: DataTypes.STRING(40) },
  containerType: { type: DataTypes.STRING(20) },
  containerQty: { type: DataTypes.INTEGER, defaultValue: 0 },
  teu: { type: DataTypes.DECIMAL(6, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('new', 'confirmed', 'loading', 'shipped', 'cancelled'), defaultValue: 'new' },
  bookingDate: { type: DataTypes.DATEONLY },
  etd: { type: DataTypes.DATEONLY },
  eta: { type: DataTypes.DATEONLY },
  freightCharge: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  customFields: { type: DataTypes.TEXT },   // B4 自定义字段扩展（JSON 字符串）
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Onboarding 演示数据标记（可一键清空）
}, { timestamps: true, paranoid: true });

module.exports = Booking;