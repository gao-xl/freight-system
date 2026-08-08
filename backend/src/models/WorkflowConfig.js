const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 流程状态机配置（P3.2）：业务对象的状态流转规则可配置化
// 统一 transition 接口会校验 fromStatus → toStatus 必须存在于此表（enabled），
// 并按 fromRole 校验操作者角色，动作后写审计、发 order.transitioned 事件。
// 不改变既有"派生式"订单状态推导（computeReached/deriveOrderStatus），
// 而是叠加一层"显式流转规则"，让"谁能从哪到哪"可由 Web UI 配置。
const WorkflowConfig = sequelize.define('WorkflowConfig', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bizType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'order' }, // order/booking/customs/finance
  fromStatus: { type: DataTypes.STRING(40), allowNull: false },  // 当前状态（'*' 表示任意）
  toStatus: { type: DataTypes.STRING(40), allowNull: false },    // 目标状态
  action: { type: DataTypes.STRING(50), defaultValue: 'update_status' }, // 动作：update_status（默认）
  fromRole: { type: DataTypes.STRING(50), allowNull: true },     // 允许操作的角色（null=不限）
  auto: { type: DataTypes.BOOLEAN, defaultValue: false },        // 是否自动化流转
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  remark: { type: DataTypes.STRING(255) },
}, { timestamps: true });

module.exports = WorkflowConfig;
