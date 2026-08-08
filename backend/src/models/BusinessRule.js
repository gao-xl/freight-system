const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 业务规则（P3.1 规则引擎 DB 化）
// 规则可来自：① 内置规则类型（ruleType 指向规则引擎注册的执行器，seed 示例数据）
//            ② 通用表达式规则（ruleType='expr'，condition 里 field/op/value 白名单评估，禁止 eval）
// 触发方式：trigger = 'cron'（定时扫描，随 runAllRules 执行）或事件名（如 'order.created'，事件驱动）
const BusinessRule = sequelize.define('BusinessRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  bizType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'order' }, // order/finance/booking/customs/customer
  ruleType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'expr' }, // 内置执行器 key 或 'expr'
  trigger: { type: DataTypes.STRING(50), defaultValue: 'cron' },                     // 'cron' | 事件名
  condition: { type: DataTypes.TEXT, allowNull: true },  // JSON：{ field, op, value } 或 { and: [...] }（expr 用）
  params: { type: DataTypes.TEXT, allowNull: true },     // JSON：内置执行器参数（如 { days: 7, threshold: 100000 }）
  action: { type: DataTypes.TEXT, allowNull: true },     // JSON：{ level, title, message, dedupPrefix }；缺省用执行器默认
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true });

module.exports = BusinessRule;
