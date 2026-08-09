const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 业务订单
const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderNo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.ENUM('import', 'export', 'transit'), defaultValue: 'export' },
  mode: { type: DataTypes.ENUM('sea', 'air', 'land', 'rail'), defaultValue: 'sea' },
  serviceType: { type: DataTypes.ENUM('fcl', 'lcl', 'charter', 'express'), defaultValue: 'fcl' },
  status: { type: DataTypes.ENUM('draft', 'confirmed', 'in_progress', 'completed', 'cancelled'), defaultValue: 'draft' },
  originPort: { type: DataTypes.STRING(50) },
  destPort: { type: DataTypes.STRING(50) },
  originPlace: { type: DataTypes.STRING(100) },
  destPlace: { type: DataTypes.STRING(100) },
  cargoDesc: { type: DataTypes.STRING(255) },
  cargoWeight: { type: DataTypes.DECIMAL(12, 2) },
  cargoVolume: { type: DataTypes.DECIMAL(12, 2) },
  packageCount: { type: DataTypes.INTEGER },
  containerNo: { type: DataTypes.STRING(50) },
  // D2 提单三要素（提单模板数据源）
  shipperName: { type: DataTypes.STRING(200) },       // 发货人
  shipperAddress: { type: DataTypes.STRING(500) },    // 发货人地址
  consigneeName: { type: DataTypes.STRING(200) },     // 收货人
  consigneeAddress: { type: DataTypes.STRING(500) },  // 收货人地址
  notifyParty: { type: DataTypes.STRING(500) },       // 通知方
  marksNumbers: { type: DataTypes.TEXT },             // 唛头
  placeOfReceipt: { type: DataTypes.STRING(100) },    // 收货地
  placeOfDelivery: { type: DataTypes.STRING(100) },   // 交货地
  freightCharges: { type: DataTypes.STRING(255) },    // 运费条款（如 FREIGHT PREPAID）
  originalBLCount: { type: DataTypes.INTEGER, defaultValue: 3 }, // 正本份数
  telexRelease: { type: DataTypes.BOOLEAN, defaultValue: false }, // 电放
  etd: { type: DataTypes.DATEONLY }, // 预计发运
  eta: { type: DataTypes.DATEONLY }, // 预计到港
  terminal: { type: DataTypes.STRING(20) },       // 青岛港码头 QQCT/QQCTU/QQCTN
  openTime: { type: DataTypes.DATE },             // 开港时间
  cutoffTime: { type: DataTypes.DATE },           // 截港时间
  currency: { type: DataTypes.STRING(10), defaultValue: 'USD' },
  totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  quotationId: { type: DataTypes.INTEGER },
  salesId: { type: DataTypes.INTEGER },
  releaseStatus: { type: DataTypes.ENUM('none', 'pending', 'approved', 'delivered'), defaultValue: 'none' }, // 放单状态
  groupId: { type: DataTypes.INTEGER }, // B2 归属小组
  ownerId: { type: DataTypes.INTEGER }, // B2 归属操作员（负责人）
  customFields: { type: DataTypes.TEXT }, // B4 自定义字段扩展（JSON 字符串）
  remark: { type: DataTypes.TEXT },
  version: { type: DataTypes.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
}, { timestamps: true, paranoid: true });

module.exports = Order;