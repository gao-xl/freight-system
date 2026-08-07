const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 外部系统对接配置（港口/海关/财务等）
const IntegrationConfig = sequelize.define('IntegrationConfig', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(50), allowNull: false }, // port / customs / finance ...
  baseUrl: { type: DataTypes.STRING(255) },
  apiKey: { type: DataTypes.STRING(255) },
  authType: { type: DataTypes.ENUM('none', 'api_key', 'basic', 'oauth2'), defaultValue: 'api_key' },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  config: { type: DataTypes.TEXT }, // JSON 扩展配置
  lastSyncAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
}, { timestamps: true });

module.exports = IntegrationConfig;