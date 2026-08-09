const crypto = require('crypto');
const { Session } = require('../models');
const config = require('../config');

// M3 会话服务：opaque refresh token 的签发、校验、轮换与撤销
// refresh token 为 48 字节随机串，仅以 SHA-256 摘要入库，杜绝数据库泄露后复用

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

// 时长表达式(如 '12h'/'30d'/'30m') → 毫秒；非法输入兜底 30 天
function exprToMs(expr) {
  const v = expr || '';
  if (/^\d+s$/.test(v)) return parseInt(v, 10) * 1000;
  if (/^\d+m$/.test(v)) return parseInt(v, 10) * 60 * 1000;
  if (/^\d+h$/.test(v)) return parseInt(v, 10) * 60 * 60 * 1000;
  if (/^\d+d$/.test(v)) return parseInt(v, 10) * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

// refresh token 过期时间
function computeExpiry() {
  return Date.now() + exprToMs(config.jwtRefreshExpiresIn);
}

// 签发新会话：返回 { sessionId, refreshToken }
async function createSession(user, { deviceLabel, ip, userAgent } = {}) {
  const refreshToken = generateRefreshToken();
  const session = await Session.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    ver: user.tokenVersion || 0,
    deviceLabel: deviceLabel || null,
    ip: ip || null,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    expiresAt: new Date(computeExpiry()),
    lastUsedAt: new Date(),
  });
  return { sessionId: session.id, refreshToken };
}

// 按 refresh token 摘要查找未撤销、未过期的会话（含用户快照）
async function findValidSessionByToken(refreshToken) {
  if (!refreshToken) return null;
  const session = await Session.findOne({
    where: { tokenHash: hashToken(refreshToken) },
    include: [{ association: 'user', attributes: ['id', 'status', 'tokenVersion', 'role', 'username', 'name'] }],
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null;
  return session;
}

// 端线下线：撤销单个会话
async function revokeSession(sessionId) {
  if (!sessionId) return;
  await Session.update({ revokedAt: new Date() }, { where: { id: sessionId } });
}

// 全部端线下线：撤销某用户所有会话（配合 tokenVersion 递增彻底失效）
async function revokeAllForUser(userId) {
  await Session.update({ revokedAt: new Date() }, { where: { userId } });
}

// 列出某用户所有会话（含已撤销，供会话管理页展示）
function listActiveSessions(userId) {
  return Session.findAll({
    where: { userId, revokedAt: null },
    order: [['lastUsedAt', 'DESC']],
    attributes: ['id', 'deviceLabel', 'ip', 'userAgent', 'expiresAt', 'lastUsedAt', 'createdAt'],
  });
}

// 清理过期 + 已撤销的僵尸会话（由定时任务调用可选）
async function cleanupExpired() {
  await Session.destroy({ where: { revokedAt: { [require('sequelize').Op.ne]: null } } });
  await Session.destroy({ where: { expiresAt: { [require('sequelize').Op.lt]: new Date() } } });
}

module.exports = {
  hashToken,
  exprToMs,
  generateRefreshToken,
  createSession,
  findValidSessionByToken,
  revokeSession,
  revokeAllForUser,
  listActiveSessions,
  cleanupExpired,
};