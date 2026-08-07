const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 场站状态记录（青岛港等集装箱场站箱状态）
// 来源：官方API / 授权抓取 / 人工录入，统一建模
const YardRecord = sequelize.define('YardRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER },          // 关联订单（可选）
  containerNo: { type: DataTypes.STRING(30) },    // 箱号
  billNo: { type: DataTypes.STRING(50) },         // 提单号
  yardCode: { type: DataTypes.STRING(30) },       // 场站编码
  yardName: { type: DataTypes.STRING(50) },       // 场站名称（冗余）
  status: { type: DataTypes.STRING(30) },         // 在场/放行/集港/查验/提取
  location: { type: DataTypes.STRING(100) },      // 场地区位
  eventTime: { type: DataTypes.DATE },
  source: { type: DataTypes.ENUM('api', 'scraper', 'manual'), defaultValue: 'manual' }, // 数据来源
  raw: { type: DataTypes.TEXT },                  // 原始回执
  queryBy: { type: DataTypes.INTEGER },           // 查询人
  queryAt: { type: DataTypes.DATE },              // 查询时间
}, {
  timestamps: true,
  indexes: [
    { fields: ['containerNo', 'yardCode'] },
    { fields: ['billNo'] },
    { fields: ['orderId'] },
  ],
});

module.exports = YardRecord;