const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 提单（主单 MBL / 分单 HBL）
const BillOfLading = sequelize.define('BillOfLading', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  blNo: { type: DataTypes.STRING(50), allowNull: false },
  blType: { type: DataTypes.ENUM('master', 'house'), allowNull: false, defaultValue: 'house' },
  orderId: { type: DataTypes.INTEGER },
  carrierId: { type: DataTypes.INTEGER },
  masterBlId: { type: DataTypes.INTEGER },
  vessel: { type: DataTypes.STRING(100) },
  voyage: { type: DataTypes.STRING(50) },
  containerNo: { type: DataTypes.STRING(200) },
  packageCount: { type: DataTypes.INTEGER },
  grossWeight: { type: DataTypes.DECIMAL(12, 2) },
  volume: { type: DataTypes.DECIMAL(12, 2) },
  shipperName: { type: DataTypes.STRING(200) },
  shipperAddress: { type: DataTypes.STRING(500) },
  consigneeName: { type: DataTypes.STRING(200) },
  consigneeAddress: { type: DataTypes.STRING(500) },
  notifyParty: { type: DataTypes.STRING(500) },
  placeOfReceipt: { type: DataTypes.STRING(100) },
  portOfLoading: { type: DataTypes.STRING(100) },
  portOfDischarge: { type: DataTypes.STRING(100) },
  placeOfDelivery: { type: DataTypes.STRING(100) },
  freightClause: { type: DataTypes.STRING(50) },
  originalCount: { type: DataTypes.INTEGER, defaultValue: 3 },
  telexRelease: { type: DataTypes.BOOLEAN, defaultValue: false },
  issueDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.ENUM('draft', 'issued', 'surrendered', 'voided'), defaultValue: 'draft' },
  remark: { type: DataTypes.TEXT },
  groupId: { type: DataTypes.INTEGER },
  ownerId: { type: DataTypes.INTEGER },
  version: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: true, paranoid: true, indexes: [{ fields: ['orderId'] }, { fields: ['blNo'] }, { fields: ['blType'] }, { fields: ['masterBlId'] }] });

module.exports = BillOfLading;