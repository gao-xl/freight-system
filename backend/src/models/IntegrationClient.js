const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const { encryptSecret, decryptSecret } = require('../utils/crypto');

// 外部调用方（入站对接渠道）注册实体。
// IntegrationConfig 描述“本系统要对接的远端系统”；IntegrationClient 描述“对接本系统的外部调用方”。
// 每个第三方通过 code 唯一标识，apiKey 作为入站回调 HMAC 签名密钥（复用 IntegrationConfig 的同款加解密）。
const IntegrationClient = sequelize.define('IntegrationClient', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(50), allowNull: false },
  apiKey: { type: DataTypes.STRING(512) },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  callCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastCallAt: { type: DataTypes.DATE },
  config: { type: DataTypes.TEXT }, // JSON 扩展配置（如回调配额、白名单 IP 等）
  remark: { type: DataTypes.TEXT },
}, {
  timestamps: true,
  indexes: [{ fields: ['code'], unique: true }],
});

// S1 安全加固：apiKey 落库前 AES-256-GCM 加密，读取时透明解密，与 IntegrationConfig 保持一致
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
IntegrationClient.addHook('beforeSave', encryptHook);
IntegrationClient.addHook('beforeBulkCreate', (records) => {
  for (const inst of records) {
    if (inst && inst.apiKey) inst.apiKey = encryptSecret(inst.apiKey);
  }
});
IntegrationClient.addHook('afterFind', decryptResult);

module.exports = IntegrationClient;