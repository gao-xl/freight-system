const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// C6 一单多箱管理：逐箱记录箱号/封号/尺寸/重量/状态
const OrderContainer = sequelize.define('OrderContainer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  containerNo: { type: DataTypes.STRING(20), allowNull: false },   // 箱号
  sealNo: { type: DataTypes.STRING(20) },                          // 封号
  sizeType: { type: DataTypes.ENUM('20', '40', '40HQ', '45', '20RF', '40RF'), defaultValue: '40' }, // 尺寸类型
  cargoDesc: { type: DataTypes.STRING(255) },                      // 本箱货描
  weight: { type: DataTypes.DECIMAL(12, 2) },                      // 重量(t)
  volume: { type: DataTypes.DECIMAL(12, 2) },                      // 体积(m3)
  packageCount: { type: DataTypes.INTEGER },                       // 件数
  status: { type: DataTypes.ENUM('planned', 'gate_in', 'loaded', 'arrived', 'delivered'), defaultValue: 'planned' }, // 逐箱状态
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true, indexes: [{ fields: ['orderId'] }] });

module.exports = OrderContainer;