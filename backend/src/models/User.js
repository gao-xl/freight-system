const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 系统用户
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  name: { type: DataTypes.STRING(50), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'manager', 'operator', 'finance', 'viewer', 'customer'), defaultValue: 'operator' },
  email: { type: DataTypes.STRING(100) },
  phone: { type: DataTypes.STRING(30) },
  status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
  lastLoginAt: { type: DataTypes.DATE },
  groupId: { type: DataTypes.INTEGER }, // B2 默认所属组（简化：用户主要归属组）
  customerId: { type: DataTypes.INTEGER }, // C5 客户自助门户：关联客户档案（仅 customer 角色）
  tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // D8 JWT 吊销版本号：改密/禁用时 +1，旧 token 即刻失效
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Onboarding：默认账号首登强制改密（改密成功即清除）
  loginFails: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // S3 登录锁定：连续失败计数
  lockedUntil: { type: DataTypes.DATE, allowNull: true }, // S3 登录锁定：锁定截止时间（未锁定为 null）
  twoFactorEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // S4 2FA：该用户是否强制二次验证
  twoFactorType: { type: DataTypes.ENUM('totp', 'email'), allowNull: true }, // S4 2FA：已绑定通道类型
  totpSecretEnc: { type: DataTypes.STRING(255), allowNull: true }, // S4 TOTP secret（AES 加密，见 utils/crypto）
  totpVerifiedAt: { type: DataTypes.DATE, allowNull: true }, // S4 TOTP 首次校验时间
  backupCodesEnc: { type: DataTypes.TEXT, allowNull: true }, // S4 备份码（SHA-256 哈希 JSON，一次性）
}, { timestamps: true });

module.exports = User;