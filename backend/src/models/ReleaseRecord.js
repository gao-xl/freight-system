const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 放单控制记录（B8）
const ReleaseRecord = sequelize.define('ReleaseRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  releaseType: { type: DataTypes.ENUM('original', 'telex', 'seaway'), defaultValue: 'original' }, // 正本/电放/海运单
  releaseNo: { type: DataTypes.STRING(50) }, // 放单号
  operatorId: { type: DataTypes.INTEGER },   // 操作人
  operatorName: { type: DataTypes.STRING(50) },
  approvalStatus: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  approverId: { type: DataTypes.INTEGER },
  approverName: { type: DataTypes.STRING(50) },
  approvedAt: { type: DataTypes.DATE },
  receivableBalance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 }, // 放单时应收未收余额快照
  remark: { type: DataTypes.TEXT },
}, { timestamps: true, indexes: [{ fields: ['orderId'] }] });

module.exports = ReleaseRecord;