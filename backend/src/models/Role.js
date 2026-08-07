const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 角色
const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true }, // 如 operator
  name: { type: DataTypes.STRING(50), allowNull: false },               // 如 操作员
  description: { type: DataTypes.STRING(255) },
  isSystem: { type: DataTypes.BOOLEAN, defaultValue: false }, // 系统内置角色不可删
  dataScope: { type: DataTypes.ENUM('all', 'group', 'self'), defaultValue: 'all' }, // B2 数据权限范围：all=全部/group=本组/self=本人
}, { timestamps: true });

module.exports = Role;