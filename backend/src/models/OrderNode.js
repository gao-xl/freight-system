const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// B3 订单实例节点（记录单票进出口进度）
const OrderNode = sequelize.define('OrderNode', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  nodeCode: { type: DataTypes.STRING(40), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'done', 'blocked'), defaultValue: 'pending' },
  doneAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
}, { timestamps: true });

module.exports = OrderNode;