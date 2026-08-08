const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 自定义报表定义（P3.3）：报表 = 数据源 + 分组 + 聚合指标 + 过滤条件 + 图表类型
// 执行接口 POST /reports/:id/run 按定义执行聚合查询，返回行列数据。
// 安全约束：分组/聚合/过滤字段全部走白名单（reportService），禁止任意字段查询。
const ReportDefinition = sequelize.define('ReportDefinition', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  bizType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'order' }, // order/finance/customer
  groupBy: { type: DataTypes.STRING(50), allowNull: true },   // 分组字段（白名单）
  measures: { type: DataTypes.TEXT, allowNull: true },         // JSON: [{field, agg, alias}]
  filters: { type: DataTypes.TEXT, allowNull: true },          // JSON: [{field, op, value}]
  chartType: { type: DataTypes.STRING(20), defaultValue: 'table' }, // table/bar/pie/line
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true });

module.exports = ReportDefinition;
