const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// C2 EDI 报文追踪：所有进出 EDI 消息留痕，便于对账与排错
const EdiMessage = sequelize.define('EdiMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  direction: { type: DataTypes.ENUM('out', 'in'), allowNull: false }, // 发出/接收
  channel: { type: DataTypes.STRING(30), defaultValue: 'edi' },       // edi/ftp/api/email
  messageType: { type: DataTypes.STRING(30) },                        // IFTMBF/IFTSTA/IFTMIN/...
  counterparty: { type: DataTypes.INTEGER },                          // 关联供应商(承运人/报关行)
  orderId: { type: DataTypes.INTEGER },                                // 关联订单
  referenceNo: { type: DataTypes.STRING(50) },                         // 业务参考号
  rawContent: { type: DataTypes.TEXT },                                // 原始报文
  status: { type: DataTypes.ENUM('pending', 'sent', 'received', 'acknowledged', 'failed'), defaultValue: 'pending' },
  error: { type: DataTypes.TEXT },
  sentAt: { type: DataTypes.DATE },
  receivedAt: { type: DataTypes.DATE },
}, { timestamps: true, indexes: [{ fields: ['orderId'] }, { fields: ['direction'] }] });

module.exports = EdiMessage;