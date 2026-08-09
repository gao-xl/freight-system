const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// M3 登录会话：每端一条，存储 opaque refresh token 的哈希（绝不存明文）
// 支持端线下线（单端撤销）与 refresh token 轮换（每次刷新作废旧 token 签新 token）
const Session = sequelize.define('Session', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, comment: 'refresh token 的 SHA-256 摘要' },
  ver: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '签发时用户 tokenVersion，改密后与当前不一致则拒刷' },
  deviceLabel: { type: DataTypes.STRING(100), comment: '设备标识（浏览器 UA 摘要）' },
  ip: { type: DataTypes.STRING(64), comment: '登录 IP' },
  userAgent: { type: DataTypes.STRING(512), comment: '完整 User-Agent' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, comment: 'refresh token 过期时间' },
  revokedAt: { type: DataTypes.DATE, comment: '撤销时间（端线下线/退出登录时写入）' },
  lastUsedAt: { type: DataTypes.DATE, comment: '最近一次刷新使用时间' },
}, {
  timestamps: true,
  // 覆盖默认 updatedAt 行为：refresh 轮换时手动更新，不依赖自动 updatedAt
  updatedAt: false,
});

module.exports = Session;