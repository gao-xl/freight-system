const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 权限点
const Permission = sequelize.define('Permission', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  module: { type: DataTypes.STRING(30), allowNull: false },  // order / finance / quotation ...
  action: { type: DataTypes.STRING(30), allowNull: false },  // create / read / update / delete / approve
  name: { type: DataTypes.STRING(50), allowNull: false },    // 如 "删除订单"
  code: { type: DataTypes.STRING(60), allowNull: false, unique: true }, // order:delete
}, { timestamps: true });

module.exports = Permission;