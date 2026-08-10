const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// P1 客户附件：客户档案下的附件（营业执照、合同、授权书等），支持上传/下载/删除。
// 数据隔离：groupId/ownerId 沿用客户归属，附件的可见范围与所属客户一致。
const CustomerAttachment = sequelize.define('CustomerAttachment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false }, // 归属客户
  category: { type: DataTypes.STRING(30), defaultValue: 'other' }, // 分类：license/contract/authorization/other
  title: { type: DataTypes.STRING(100) },                    // 附件标题（默认取原文件名）
  filePath: { type: DataTypes.STRING(255), allowNull: false }, // 存储相对路径（uploads 下）
  originalName: { type: DataTypes.STRING(200) },
  mimeType: { type: DataTypes.STRING(100) },
  size: { type: DataTypes.INTEGER, defaultValue: 0 },        // 字节
  remark: { type: DataTypes.STRING(255) },
  uploadedBy: { type: DataTypes.INTEGER },                   // 上传人
  groupId: { type: DataTypes.INTEGER },                      // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },                      // 数据隔离：归属操作员
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['customerId'] }] });

module.exports = CustomerAttachment;