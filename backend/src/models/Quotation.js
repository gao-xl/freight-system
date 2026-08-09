const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 报价/询价单头
const Quotation = sequelize.define('Quotation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quoteNo: { type: DataTypes.STRING(40), allowNull: false, unique: true }, // 报价单号
  customerId: { type: DataTypes.INTEGER, allowNull: false },              // 客户
  type: { type: DataTypes.ENUM('import', 'export', 'transit'), defaultValue: 'export' },
  mode: { type: DataTypes.ENUM('sea', 'air', 'land', 'rail'), defaultValue: 'sea' },
  serviceType: { type: DataTypes.ENUM('fcl', 'lcl', 'charter', 'express'), defaultValue: 'fcl' },
  originPort: { type: DataTypes.STRING(50) },    // 起运港
  destPort: { type: DataTypes.STRING(50) },      // 目的港
  originPlace: { type: DataTypes.STRING(100) },  // 起运地
  destPlace: { type: DataTypes.STRING(100) },    // 目的地
  cargoDesc: { type: DataTypes.STRING(255) },    // 货物品名
  cargoWeight: { type: DataTypes.DECIMAL(12, 2) },
  cargoVolume: { type: DataTypes.DECIMAL(12, 2) },
  packageCount: { type: DataTypes.INTEGER },
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },      // 报价总额
  costAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },        // 预估成本
  profitAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },      // 预估毛利
  profitRate: { type: DataTypes.DECIMAL(6, 2), defaultValue: 0 },         // 毛利率 %
  status: { type: DataTypes.ENUM('draft', 'sent', 'confirmed', 'converted', 'expired', 'cancelled'), defaultValue: 'draft' },
  validUntil: { type: DataTypes.DATEONLY },       // 报价有效期
  salesId: { type: DataTypes.INTEGER },           // 业务员
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Onboarding 演示数据标记（可一键清空）
}, { timestamps: true, paranoid: true });

module.exports = Quotation;