const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 单证（提单/装箱单/发票/原产地证等）
const Document = sequelize.define('Document', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  docType: { type: DataTypes.ENUM('bl', 'packing_list', 'invoice', 'certificate_of_origin', 'insurance', 'other'), defaultValue: 'bl' },
  docNo: { type: DataTypes.STRING(50) },
  orderId: { type: DataTypes.INTEGER },
  title: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.ENUM('draft', 'issued', 'sent', 'received', 'archived'), defaultValue: 'draft' },
  filePath: { type: DataTypes.STRING(255) },
  originalName: { type: DataTypes.STRING(200) },
  mimeType: { type: DataTypes.STRING(100) },
  extractedText: { type: DataTypes.TEXT }, // B5 文件文本提取结果（全文检索用）
  extractionStatus: { type: DataTypes.ENUM('none', 'pending', 'done', 'failed'), defaultValue: 'none' }, // none=无/pending=待提取/done=完成/failed=失败
  issuedBy: { type: DataTypes.STRING(50) },
  issueDate: { type: DataTypes.DATEONLY },
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },     // 数据隔离：归属小组
  ownerId: { type: DataTypes.INTEGER },     // 数据隔离：归属操作员（负责人）
}, { timestamps: true });

module.exports = Document;