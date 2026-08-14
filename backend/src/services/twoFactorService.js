'use strict';

// S4 二次认证(2FA)服务：TOTP / 邮箱验证码 / 备份码 / 暂态凭证
// 依赖方向：本服务经 dataAccess 取模型与 CompanyProfile 配置；配置读取走本项目既有 crypto 与 notificationService。
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const config = require('../config');
const { CompanyProfile } = require('../services/dataAccess');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const notificationService = require('../services/notificationService');

// otplib 默认 preset 即 RFC 6238 / RFC 4226 兼容（30s 一步），这里显式声明窗口容忍 ±1 步
authenticator.options = { ...authenticator.options, window: 1 };

const ISSUER = '货代系统';

// ── 系统级安全设置（单行 CompanyProfile）──
async function getSecuritySettings() {
  const profile = await CompanyProfile.findOne();
  return {
    enabled: !!(profile && profile.security2faEnabled),
    emailEnabled: !!(profile && profile.securityEmailEnabled),
    totpEnabled: !!(profile && profile.securityTotpEnabled),
  };
}

// 该用户需 2FA 时，可用的通道列表（绑定过则用绑定通道；未绑定优先邮箱，其次 TOTP）
function channelsFor(user, settings) {
  if (user.twoFactorType) return [user.twoFactorType];
  if (settings.emailEnabled) return ['email'];
  if (settings.totpEnabled) return ['totp'];
  return [];
}

// 是否需要对当前用户做二次验证（总开关关 → fail-open 直接放行）
async function needs2fa(user) {
  if (!user || !user.twoFactorEnabled) return false;
  const settings = await getSecuritySettings();
  if (!settings.enabled) return false;
  return channelsFor(user, settings).length > 0;
}

function signToken(payload, ttl) {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, config.jwtSecret, { expiresIn: ttl });
}

// ── 登录暂态 token（pending）：5 分钟，仅允许访问 2fa 端点 ──
function signPendingToken(user) {
  return signToken({ scope: '2fa_pending', userId: user.id, ver: user.tokenVersion || 0 }, config.twoFactor.pendingTtl);
}
function verifyPendingToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.scope !== '2fa_pending' || !decoded.userId) return null;
  return decoded;
}

// ── 敏感操作复核 token（reauth）：3 分钟，供 requireReauthIfEnabled 校验 ──
function signReauthToken(user) {
  return signToken({ scope: 'reauth', userId: user.id, ver: user.tokenVersion || 0 }, config.twoFactor.reauthTtl);
}
function verifyReauthToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (decoded.scope !== 'reauth' || !decoded.userId) return null;
  return decoded;
}

// ── TOTP ──
async function setupTotp(user) {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(user.email || user.username, ISSUER, secret);
  user.totpSecretEnc = encryptSecret(secret);
  user.twoFactorType = user.twoFactorType || 'totp';
  await user.save();
  const qrDataURL = await QRCode.toDataURL(otpauthUri);
  return { secret, otpauthUri, qrDataURL };
}

function verifyTotp(user, code) {
  const secret = decryptSecret(user.totpSecretEnc);
  if (!secret) return false;
  return authenticator.check(String(code).trim(), secret);
}

// ── 备份码（一次性）──
function generateBackupCodes() {
  const codes = [];
  const hashes = [];
  for (let i = 0; i < 10; i += 1) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4)
      + '-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
    codes.push(code);
    hashes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { codes, hashes };
}
function readBackupHashes(user) {
  try {
    const raw = decryptSecret(user.backupCodesEnc);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function storeBackupHashes(user, hashes) {
  user.backupCodesEnc = encryptSecret(JSON.stringify(hashes));
  await user.save();
}
async function consumeBackupCode(user, code) {
  const hash = crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
  const hashes = readBackupHashes(user);
  const idx = hashes.indexOf(hash);
  if (idx === -1) return false;
  hashes.splice(idx, 1);
  await storeBackupHashes(user, hashes);
  return true;
}

// ── 邮箱验证码（进程内存储：单实例可共享；多实例需迁 Redis，见 plan Reservation）──
const emailStore = new Map(); // userId -> { code, expiresAt, lastSentAt, attempts }
function generateEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
async function sendEmailCode(user, { purpose = '登录' } = {}) {
  if (!user.email) return { skipped: true, reason: '用户未绑定邮箱' };
  const rec = emailStore.get(user.id);
  const now = Date.now();
  if (rec && now - rec.lastSentAt < config.twoFactor.resendWindowMs) {
    return { skipped: true, reason: '发送过于频繁，请稍后再试', retryAfterMs: config.twoFactor.resendWindowMs - (now - rec.lastSentAt) };
  }
  const code = generateEmailCode();
  emailStore.set(user.id, { code, expiresAt: now + config.twoFactor.codeTtlMs, lastSentAt: now, attempts: 0 });
  const result = await notificationService.sendEmailTo(user.email, {
    subject: `【货代系统】${purpose}验证码`,
    text: `您的${purpose}验证码是：${code}\n有效期 ${Math.floor(config.twoFactor.codeTtlMs / 60000)} 分钟，请勿泄露给他人。`,
  });
  return result;
}
function verifyEmailCode(user, code) {
  const rec = emailStore.get(user.id);
  if (!rec) return false;
  if (Date.now() > rec.expiresAt) {
    emailStore.delete(user.id);
    return false;
  }
  if (rec.attempts >= config.twoFactor.maxAttempts) {
    emailStore.delete(user.id);
    return false;
  }
  rec.attempts += 1;
  if (rec.code === String(code).trim()) {
    emailStore.delete(user.id);
    return true;
  }
  return false;
}

// 统一验证入口：按用户绑定通道校验邮箱码 / TOTP / 备份码
async function verifyAny(user, code) {
  if (user.twoFactorType === 'email') return verifyEmailCode(user, code);
  if (user.twoFactorType === 'totp') {
    if (verifyTotp(user, code)) return true;
    return consumeBackupCode(user, code);
  }
  // 未绑定具体通道：邮箱码优先，其次 TOTP，最后备份码
  if (verifyEmailCode(user, code)) return true;
  if (verifyTotp(user, code)) return true;
  return consumeBackupCode(user, code);
}

module.exports = {
  getSecuritySettings,
  channelsFor,
  needs2fa,
  signPendingToken,
  verifyPendingToken,
  signReauthToken,
  verifyReauthToken,
  setupTotp,
  verifyTotp,
  generateBackupCodes,
  storeBackupHashes,
  consumeBackupCode,
  sendEmailCode,
  verifyEmailCode,
  verifyAny,
  emailStore,
};