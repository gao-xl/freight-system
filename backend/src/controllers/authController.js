const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../services/dataAccess');
const config = require('../config');
const { ok, fail, asyncHandler } = require('../utils/response');
const { getPermissions } = require('../services/permissionService');
const sessionService = require('../services/sessionService');
const twoFactorService = require('../services/twoFactorService');
const apiKeyService = require('../services/apiKeyService');
const auditService = require('../core/auditService');

// P0-2 token 安全：refresh token（30 天长期凭证）经 httpOnly Cookie 承载，
// 前端 JS 无法读取，阻断 XSS 窃取长期会话。access token 保持短效 header。
const REFRESH_COOKIE = 'ft_refresh';

// P1 加固：与 middleware/auth.js 校验对齐的 issuer/audience，固定 HS256 防算法混淆
const JWT_ISSUER = 'freight-system';
const JWT_AUDIENCE = 'freight-web';
const COOKIE_MAX_AGE = sessionService.exprToMs(config.jwtRefreshExpiresIn);

// 解析请求 Cookie 头（不引入 cookie-parser 依赖，仅需读取一个名值对）
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// 设置 httpOnly refresh cookie（SameSite=Lax：同源受保护，跨站无法携带；生产可加 Secure）
function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

// 清除 refresh cookie
function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });
}

// 占位密码哈希：用户不存在时也执行一次 bcrypt 比较，保持耗时一致，防时序侧信道枚举用户名
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

// 签发 access token；携带 sid（会话 id），供 end端下线时精确定位撤销
function signAccessToken(user, sessionId) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      ver: user.tokenVersion || 0,
      sid: sessionId,
      // 会话内单端下线（logout）不改 tokenVersion，仅凭 sid 撤销；改密/禁用才递增 tokenVersion 全局失效
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
}

// 从请求提取设备信息（浏览器 UA / IP）
function deviceInfo(req) {
  const ua = req.headers['user-agent'] || '';
  const label = ua ? ua.slice(0, 60) : '未知设备';
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
  return { deviceLabel: label, ip, userAgent: ua };
}

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, '用户名和密码不能为空');
  const user = await User.findOne({ where: { username } });
  const { maxFails, lockoutMinutes } = config.loginLock;
  const now = Date.now();

  // S3 登录锁定：账号锁定中直接拒绝并返回剩余分钟数（423，避免走前端 401 刷新流程）
  if (user && user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    const remainMin = Math.ceil((new Date(user.lockedUntil).getTime() - now) / 60000);
    return fail(res, `登录失败次数过多，账号已锁定，请 ${remainMin} 分钟后再试`, 1, 423);
  }

  const validUser = !!user && user.status === 'active';
  // 恒定时间比较：无论用户是否存在/禁用都执行 bcrypt，避免通过响应时间枚举用户名
  const passwordValid = validUser ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, DUMMY_HASH);
  if (!validUser || !passwordValid) {
    // S3 锁定：仅对真实存在的活动账号累计失败（不存在的账号不产生可枚举副作用，保持恒定时间比较）
    if (validUser) {
      const fails = (user.loginFails || 0) + 1;
      if (fails >= maxFails) {
        await user.update({ loginFails: 0, lockedUntil: new Date(now + lockoutMinutes * 60000) });
      } else {
        await user.update({ loginFails: fails });
      }
    }
    return fail(res, '用户名或密码错误', 1, 401);
  }
  // S3 登录成功：清除失败计数与锁定
  await user.update({ lastLoginAt: new Date(), loginFails: 0, lockedUntil: null });
  // S4 2FA：若有需二次验证的用户，先签发 pending 暂态（5 分钟），验证通过才进正式会话
  if (await twoFactorService.needs2fa(user)) {
    const settings = await twoFactorService.getSecuritySettings();
    const pendingToken = twoFactorService.signPendingToken(user);
    return ok(res, {
      pending: true,
      pendingToken,
      channels: twoFactorService.channelsFor(user, settings),
      mustChangePassword: !!user.mustChangePassword,
    }, '登录成功，请完成二次验证');
  }
  // D8：签发带 ver（tokenVersion）与 jti 的 token；M3：同步签发 refresh token 并登记会话
  const session = await sessionService.createSession(user, deviceInfo(req));
  const token = signAccessToken(user, session.sessionId);
  const permissions = await getPermissions(user.id);
  // P0-2 / P1 加固：refresh token 仅经 httpOnly cookie 下发，不在响应体暴露，
  // 防止被 JS（XSS）读取长期会话；前端刷新走 cookie。
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    token,
    expiresIn: Math.floor(sessionService.exprToMs(config.jwtExpiresIn) / 1000),
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions, mustChangePassword: !!user.mustChangePassword },
  }, '登录成功');
});

// 刷新：校验 refresh token → 轮换（撤销旧会话、签发全新 access+refresh）→ 返回新对
// P0-2：token 优先取自 httpOnly cookie（前端 JS 不可读），body 为兼容回退
const refresh = asyncHandler(async (req, res) => {
  const fromCookie = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
  const { refreshToken: bodyToken } = req.body || {};
  const refreshToken = fromCookie || bodyToken;
  const session = refreshToken ? await sessionService.findValidSessionByToken(refreshToken) : null;
  // 无效/过期/已撤销统一文案，不暴露具体原因
  if (!session) return fail(res, '登录会话已失效，请重新登录', 1, 401);
  const user = session.user;
  if (!user || user.status !== 'active') {
    await sessionService.revokeSession(session.id);
    return fail(res, '账号不可用，请重新登录', 1, 401);
  }
  // 改密后 tokenVersion 递增，旧会话 ver 与当前不一致 → 拒刷并撤销，保证改密即全局下线
  if ((session.ver || 0) !== Number(user.tokenVersion || 0)) {
    await sessionService.revokeSession(session.id);
    return fail(res, '登录会话已失效，请重新登录', 1, 401);
  }
  // 轮换：撤销旧会话，签发新会话（refresh token 单次使用）
  await sessionService.revokeSession(session.id);
  const newSession = await sessionService.createSession(user, {
    deviceLabel: session.deviceLabel,
    ip: session.ip,
    userAgent: session.userAgent,
  });
  const token = signAccessToken(user, newSession.sessionId);
  const permissions = await getPermissions(user.id);
  // P1 加固：新 refresh 仅经 httpOnly cookie 下发，不在响应体暴露
  setRefreshCookie(res, newSession.refreshToken);
  ok(res, {
    token,
    expiresIn: Math.floor(sessionService.exprToMs(config.jwtExpiresIn) / 1000),
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions, mustChangePassword: !!user.mustChangePassword },
  }, '刷新成功');
});

// 端线下线：撤销当前会话（access token 中携带的 sid）
const logout = asyncHandler(async (req, res) => {
  if (req.sessionId) {
    await sessionService.revokeSession(req.sessionId);
  }
  clearRefreshCookie(res);
  ok(res, null, '已退出登录');
});

// 全部端线下线 + 递增 tokenVersion（使该用户所有 access token 立即失效）
const logoutAll = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await sessionService.revokeAllForUser(req.user.id);
  clearRefreshCookie(res);
  ok(res, null, '已在所有设备下线');
});

// 当前用户活跃会话列表（会话管理）
const sessions = asyncHandler(async (req, res) => {
  const list = await sessionService.listActiveSessions(req.user.id);
  ok(res, list.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    ip: s.ip,
    expiresAt: s.expiresAt,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    current: s.id === req.sessionId,
  })));
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ['id', 'username', 'name', 'role', 'email', 'phone', 'lastLoginAt', 'customerId', 'mustChangePassword', 'twoFactorEnabled', 'twoFactorType', 'totpVerifiedAt'],
  });
  const permissions = await getPermissions(user.id);
  ok(res, { ...user.toJSON(), permissions });
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!await bcrypt.compare(oldPassword, user.password)) return fail(res, '原密码错误');
  user.password = await bcrypt.hash(newPassword, 10);
  // D8：改密后递增版本号，使该用户此前签发的所有 token 失效
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  // Onboarding：改密成功即清除强制改密标记
  user.mustChangePassword = false;
  await user.save();
  // M3：改密即全局下线所有会话
  await sessionService.revokeAllForUser(user.id);
  // P1 修复：改密后吊销该用户全部接口密钥（长期无失效交互的凭据不应在密码重置后继续有效）
  await apiKeyService.revokeAllForUser(user.id);
  ok(res, null, '密码修改成功，其他设备需重新登录');
});

// S4 ── 二次认证端点 ──
// 从 pending token 解析用户并校验 tokenVersion 未变（改密/禁用后暂态立即失效）
async function userFromPending(token) {
  if (!token) return null;
  const decoded = twoFactorService.verifyPendingToken(token);
  if (!decoded) return null;
  const user = await User.findByPk(decoded.userId);
  if (!user || user.status !== 'active') return null;
  if ((decoded.ver || 0) !== Number(user.tokenVersion || 0)) return null;
  return user;
}

// 登录 2FA 发送邮箱验证码（pending 态）
const post2faSend = asyncHandler(async (req, res) => {
  const user = await userFromPending((req.body || {}).pendingToken);
  if (!user) return fail(res, '暂态凭证无效或已过期，请重新登录', 1, 401);
  const result = await twoFactorService.sendEmailCode(user, { purpose: '登录' });
  if (result.skipped) return fail(res, result.reason || '邮箱验证码发送失败', 1, 429);
  if (result.sent) return ok(res, null, '验证码已发送');
  return fail(res, '验证码发送失败，请稍后再试', 1, 500);
});

// 登录 2FA 校验（邮箱码/TOTP/备份码）→ 签发正式会话
const post2faVerify = asyncHandler(async (req, res) => {
  const { pendingToken, code } = req.body || {};
  const user = await userFromPending(pendingToken);
  if (!user) return fail(res, '暂态凭证无效或已过期，请重新登录', 1, 401);
  if (!code) return fail(res, '请输入验证码');
  if (!await twoFactorService.verifyAny(user, code)) return fail(res, '验证码错误或已过期', 1, 401);
  const session = await sessionService.createSession(user, deviceInfo(req));
  const token = signAccessToken(user, session.sessionId);
  const permissions = await getPermissions(user.id);
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    token,
    refreshToken: session.refreshToken,
    expiresIn: Math.floor(sessionService.exprToMs(config.jwtExpiresIn) / 1000),
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions, mustChangePassword: !!user.mustChangePassword },
  }, '二次验证通过');
});

// TOTP 绑定（登录态）：返回 secret / otpauth URI / 二维码 + 备份码
// P1 修复：绑定/重绑 TOTP 前校验当前密码，防止会话劫持者无复核地重绑二次因子接管 2FA；
// 与 disable2fa 口径一致（敏感启停均需当前密码或重认证）。
const setupTotp = asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!await bcrypt.compare(password || '', user.password)) return fail(res, '密码校验失败', 1, 403);
  const { secret, otpauthUri, qrDataURL } = await twoFactorService.setupTotp(user);
  const { codes, hashes } = twoFactorService.generateBackupCodes();
  await twoFactorService.storeBackupHashes(user, hashes);
  ok(res, { secret, otpauthUri, qrDataURL, backupCodes: codes });
});

// 解绑 2FA（登录态 + 校验当前密码）
const disable2fa = asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!await bcrypt.compare(password || '', user.password)) return fail(res, '密码校验失败');
  user.twoFactorEnabled = false;
  user.twoFactorType = null;
  user.totpSecretEnc = null;
  user.totpVerifiedAt = null;
  user.backupCodesEnc = null;
  await user.save();
  ok(res, null, '已关闭二次验证');
});

// 敏感操作复核：发送邮箱验证码（登录态）
const reauthSend = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  const result = await twoFactorService.sendEmailCode(user, { purpose: '操作复核' });
  if (result.skipped) return fail(res, result.reason || '邮箱验证码发送失败', 1, 429);
  if (result.sent) return ok(res, null, '验证码已发送');
  return fail(res, '验证码发送失败，请稍后再试', 1, 500);
});

// 敏感操作复核：校验 2FA → 签发短效 reauth token
const reauthVerify = asyncHandler(async (req, res) => {
  const { code } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!code) return fail(res, '请输入验证码');
  if (!await twoFactorService.verifyAny(user, code)) return fail(res, '验证码错误或已过期', 1, 401);
  ok(res, { reauthToken: twoFactorService.signReauthToken(user) }, '验证通过');
});

// B1 加固：管理员手动解锁被登录锁定冻结的账号
const unlockAccount = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const user = await User.findOne({ where: { username } });
  if (!user) return fail(res, '用户不存在', 1, 404);
  await user.update({ loginFails: 0, lockedUntil: null });
  await auditService.record({
    userId: req.user?.id,
    username: req.user?.username,
    module: 'auth',
    action: 'unlock_account',
    targetId: user.id,
    summary: `管理员解锁被锁定账号 ${username}`,
  });
  ok(res, null, '账号已解锁，可重新登录');
});

module.exports = {
  login, refresh, logout, logoutAll, sessions, me, changePassword,
  post2faSend, post2faVerify, setupTotp, disable2fa, reauthSend, reauthVerify, unlockAccount,
};