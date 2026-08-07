const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// B3 流程节点模板（进出口各一套，可配置）
const FlowNode = sequelize.define('FlowNode', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bizType: { type: DataTypes.ENUM('import', 'export'), allowNull: false }, // 进出口
  nodeCode: { type: DataTypes.STRING(40), allowNull: false }, // booking / pickup / stuffing / ...
  nodeName: { type: DataTypes.STRING(50), allowNull: false },
  sort: { type: DataTypes.INTEGER, defaultValue: 0 },
  required: { type: DataTypes.BOOLEAN, defaultValue: false },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { timestamps: true });

module.exports = FlowNode;