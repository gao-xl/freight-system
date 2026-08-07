const { DataTypes } = require('sequelize');
const sequelize = require('../db');

// 接口密钥：面向脚本、定时任务、第三方系统的非交互式认证凭据
// 明文密钥不落库，只存 SHA-256 摘要（64 位十六进制），泄库也无法还原出可用密钥。
// 表结构与 migrations/20260807000002-api-keys.js 一一对应，改这里必须同步改迁移。
const ApiKey = sequelize.define('ApiKey', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // 明文密钥的 SHA-256 摘要；唯一约束同时充当认证时的查找索引
  keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  // 绑定用户：密钥的权限上限永远不超过该用户，且审计日志记在该用户名下
  userId: { type: DataTypes.INTEGER, allowNull: false },
  // 密钥角色（对应 Role.code，如 admin/operator/finance/viewer）
  // 生效方式：有效权限 = 绑定用户权限 ∩ 该角色权限，只能收窄不能提权
  role: { type: DataTypes.STRING(20) },
  // 用途备注，便于日后识别与撤销
  name: { type: DataTypes.STRING(100), allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  // 最近使用时间；为避免每请求一次写库，认证层按分钟级节流更新
  lastUsedAt: { type: DataTypes.DATE },
  // 过期时间；为空表示长期有效
  expiresAt: { type: DataTypes.DATE },
  // 数据隔离：填了就把该密钥的可见范围收窄到指定小组
  groupId: { type: DataTypes.INTEGER },
  // 数据隔离：填了就把该密钥的可见范围收窄到本人数据（取值必须等于 userId）
  ownerId: { type: DataTypes.INTEGER },
}, { timestamps: true });

module.exports = ApiKey;
