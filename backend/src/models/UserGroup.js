const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 用户-小组关联（B2 数据权限隔离：一个用户可属于多个组）
const UserGroup = sequelize.define('UserGroup', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  groupId: { type: DataTypes.INTEGER, allowNull: false },
}, { timestamps: true });

module.exports = UserGroup;