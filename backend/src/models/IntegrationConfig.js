const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const { encryptSecret, decryptSecret } = require('../utils/crypto');

// 外部系统对接配置（港口/海关/财务等）
const IntegrationConfig = sequelize.define('IntegrationConfig', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(50), allowNull: false }, // port / customs / finance ...
  baseUrl: { type: DataTypes.STRING(255) },
  apiKey: { type: DataTypes.STRING(512) },
  authType: { type: DataTypes.ENUM('none', 'api_key', 'basic', 'oauth2'), defaultValue: 'api_key' },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  config: { type: DataTypes.TEXT }, // JSON 扩展配置
  lastSyncAt: { type: DataTypes.DATE },
  remark: { type: DataTypes.TEXT },
}, { timestamps: true });

// S1 安全加固：第三方集成 apiKey 落库前 AES-256-GCM 加密，读取时透明解密。
// 覆盖实例路径（create/update）与批量路径（batch-update），保证所有写入入口一致性。
function encryptHook(inst) {
  if (inst.changed && !inst.changed('apiKey')) return; // apiKey 未变更则保持原密文
  if (inst.apiKey) inst.apiKey = encryptSecret(inst.apiKey);
}
function decryptResult(insts) {
  const list = Array.isArray(insts) ? insts : [insts];
  for (const inst of list) {
    if (inst && inst.apiKey) inst.apiKey = decryptSecret(inst.apiKey);
  }
}
IntegrationConfig.addHook('beforeSave', encryptHook);
IntegrationConfig.addHook('beforeBulkCreate', (records) => {
  for (const inst of records) {
    if (inst && inst.apiKey) inst.apiKey = encryptSecret(inst.apiKey);
  }
});
IntegrationConfig.addHook('beforeBulkUpdate', (options) => {
  if (options.attributes && Object.prototype.hasOwnProperty.call(options.attributes, 'apiKey') && options.attributes.apiKey) {
    options.attributes.apiKey = encryptSecret(options.attributes.apiKey);
  }
});
IntegrationConfig.addHook('afterFind', decryptResult);

module.exports = IntegrationConfig;