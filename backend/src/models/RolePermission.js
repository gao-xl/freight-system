const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 角色-权限 关联
const RolePermission = sequelize.define('RolePermission', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  roleId: { type: DataTypes.INTEGER, allowNull: false },
  permissionId: { type: DataTypes.INTEGER, allowNull: false },
}, { timestamps: true });

module.exports = RolePermission;