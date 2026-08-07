const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 青岛港专项业务节点（订购单级）
// 覆盖青岛港出口 7+ 节点看板：提箱→装箱→进港→运抵→放行→装载舱单→装船→离港
const QingdaoNode = sequelize.define('QingdaoNode', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },          // 关联订单
  bookingId: { type: DataTypes.INTEGER },                          // 关联订舱（可选）
  node: {
    type: DataTypes.ENUM(
      'picked_up',          // 提箱
      'loaded',             // 装箱/重箱回场
      'arrived_port',       // 进港/集港
      'manifest_report',    // 运抵报告
      'customs_release',    // 海关放行
      'loading_manifest',   // 装载舱单
      'loaded_on_board',    // 装船
      'departed'            // 离港
    ),
    allowNull: false,
  },
  status: { type: DataTypes.ENUM('pending', 'done', 'warning', 'blocked'), defaultValue: 'pending' },
  eventTime: { type: DataTypes.DATE },
  detail: { type: DataTypes.STRING(255) },
  source: { type: DataTypes.ENUM('manual', 'api', 'edi'), defaultValue: 'manual' },
  operator: { type: DataTypes.STRING(50) },
}, {
  timestamps: true,
  indexes: [{ unique: true, fields: ['orderId', 'node'] }], // 每订单每节点一条最新状态
});

module.exports = QingdaoNode;