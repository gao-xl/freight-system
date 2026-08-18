const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 打印模板（提单/发票/装箱单/报价单/报关单/对账单/订单/结算单）
const PrintTemplate = sequelize.define('PrintTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },       // 模板名
  docType: {
    type: DataTypes.ENUM('bl', 'invoice', 'packing_list', 'quotation', 'customs', 'statement', 'order', 'settlement', 'debit_note'),
    allowNull: false,
  },
  content: { type: DataTypes.TEXT },       // 模板 JSON（区块定义）
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },    // 是否默认模板
  pageSize: { type: DataTypes.STRING(20), defaultValue: 'A4' },   // A4/A5/Letter
  logoUrl: { type: DataTypes.STRING(255) },  // 公司 Logo
  header: { type: DataTypes.TEXT },          // 自定义页眉（文本/HTML）
  footer: { type: DataTypes.TEXT },          // 自定义页脚
  remark: { type: DataTypes.TEXT },
  // P0 套打配置
  overlayMode: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否套打模式
  offsetX: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },   // 水平偏移 mm
  offsetY: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },   // 垂直偏移 mm
  scale: { type: DataTypes.DECIMAL(4, 2), defaultValue: 1.0 },   // 缩放比例 0.5-2.0
  paperSize: { type: DataTypes.STRING(20) },                     // 套打纸张规格（如 A4/Letter/自定义）
}, {
  timestamps: true,
  indexes: [{ fields: ['docType'] }],
});

module.exports = PrintTemplate;