const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 业务小组/部门（B2 数据权限隔离）
const Group = sequelize.define('Group', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(50), allowNull: false },        // 组名，如 出口一部
  code: { type: DataTypes.STRING(30), unique: true },            // 组编码
  description: { type: DataTypes.STRING(255) },
  ownerId: { type: DataTypes.INTEGER },                          // 组长（用户）
  status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
}, { timestamps: true });

module.exports = Group;