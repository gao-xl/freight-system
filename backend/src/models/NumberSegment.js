const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P1 发票号段：可配置的连续号段，开票时按顺序自动分配下一号，避免随机号难以追溯。
// 每个号段独立计数（currentSeq），发号采用行级锁（SELECT ... FOR UPDATE）保证并发下不重号。
// endSeq=0 表示不设上限（自动续号）；bizType 区分应收/应付等业务。
const NumberSegment = sequelize.define('NumberSegment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bizType: { type: DataTypes.STRING(30), allowNull: false }, // invoice_ar / invoice_ap
  prefix: { type: DataTypes.STRING(30), allowNull: false },  // 号段前缀，如 AR / AP
  currentSeq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, // 当前已发到的序号
  startSeq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 },  // 起始序号
  endSeq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },    // 结束序号（0=不设上限）
  digit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },    // 序号位数（补齐前导零）
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  remark: { type: DataTypes.STRING(255) },
  groupId: { type: DataTypes.INTEGER }, // 数据隔离：归属小组（0/空=全局共享号段）
}, {
  timestamps: true,
  indexes: [{ fields: ['bizType'] }, { unique: true, fields: ['bizType', 'prefix'] }],
});

module.exports = NumberSegment;