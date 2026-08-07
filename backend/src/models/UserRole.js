const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 用户-角色 关联
const UserRole = sequelize.define('UserRole', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  roleId: { type: DataTypes.INTEGER, allowNull: false },
}, { timestamps: true });

module.exports = UserRole;