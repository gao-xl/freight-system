const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 本地运价小库：OPC 报价提效用私有运价数据，不接外部运价网络
// 数据隔离：groupId/ownerId（与 P2.5 其他业务模型一致）
const FreightRate = sequelize.define('FreightRate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  route: { type: DataTypes.STRING(100) },         // 航线名，如"青岛-洛杉矶"
  originPort: { type: DataTypes.STRING(50) },      // 起运港
  destPort: { type: DataTypes.STRING(50) },        // 目的港
  carrier: { type: DataTypes.STRING(50) },         // 船司
  containerType: { type: DataTypes.ENUM('20GP', '40GP', '40HQ') }, // 箱型
  rate: { type: DataTypes.DECIMAL(12, 2) },        // 运价
  currency: { type: DataTypes.STRING(10), defaultValue: 'CNY' },
  validFrom: { type: DataTypes.DATE },             // 有效期起（空=长期有效）
  validTo: { type: DataTypes.DATE },               // 有效期止（空=长期有效）
  remark: { type: DataTypes.STRING(255) },
  groupId: { type: DataTypes.INTEGER },            // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },            // 数据隔离：归属操作员（负责人）
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Onboarding 演示数据标记（可一键清空）
}, {
  timestamps: true,
  indexes: [{ fields: ['originPort', 'destPort', 'containerType'] }], // 检索热路径
});

module.exports = FreightRate;
