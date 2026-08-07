const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 公司部门（组织架构，支持多级树）
const Department = sequelize.define('Department', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(50), allowNull: false },       // 部门名称
  code: { type: DataTypes.STRING(30), unique: true },           // 部门编码
  parentId: { type: DataTypes.INTEGER, defaultValue: 0 },       // 上级部门（0 为顶层）
  leaderId: { type: DataTypes.INTEGER },                        // 负责人（用户）
  sort: { type: DataTypes.INTEGER, defaultValue: 0 },           // 排序
  status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
}, { timestamps: true });

module.exports = Department;