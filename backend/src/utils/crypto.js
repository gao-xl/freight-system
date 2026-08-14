'use strict';
/**
 * 敏感配置字段（第三方集成密钥）AES-256-GCM 加密工具
 *
 * 密文格式：enc:v1:<iv_b64>:<tag_b64>:<data_b64>
 *   - 带 enc:v1: 前缀用于识别密文，避免对历史明文反复加密
 *   - 每次加密使用随机 IV + 认证标签（GCM），可检测篡改
 *
 * 主密钥：scrypt 派生自环境变量 INTEGRATION_SECRET（回退 JWT_SECRET；
 * 均未配置时用 dev 占位——生产环境必须配置其一，否则密钥加密形同虚设）。
 * 安全性：数据库/备份泄露时，第三方集成密钥仍为密文，需主密钥才能解密。
 */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function masterKey() {
  const secret = process.env.INTEGRATION_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-integration-secret';
  return crypto.scryptSync(secret, 'freight-system-integration', 32);
}

// 加密明文；已加密/空值原样返回
function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  if (typeof plain === 'string' && plain.startsWith(PREFIX)) return plain;
  const key = masterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

// 解密；非密文原样返回，解密失败（主密钥变更/数据损坏）返回 null 触发 fail-open
function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

module.exports = { encryptSecret, decryptSecret, PREFIX };