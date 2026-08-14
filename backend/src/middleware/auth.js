const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Session } = require('../models');
const { getPermissions, getEffectivePermissions } = require('../services/permissionService');
const { verifyPlainKey, touchLastUsed } = require('../services/apiKeyService');
const { logger } = require('../utils/logger');

// 支持两种认证方式，优先级固定：
//   1. Authorization: Bearer <jwt>   交互式会话（前端登录）
//   2. X-API-Key: <key>              非交互式调用（脚本 / 定时任务 / 第三方系统）
// 两者同时出现时以 Authorization 为准，不做回退——避免 JWT 过期后被密钥静默顶替，
// 让调用方的身份始终是确定的。
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      // D8：每次请求校验用户存在/启用 + tokenVersion 匹配（改密/禁用后旧 token 即刻失效）
      const userQuery = User.findByPk(decoded.id, { attributes: ['id', 'status', 'tokenVersion', 'customerId', 'mustChangePassword'] });
      // M3：access token 携带 sid，校验对应会话未被端线下线撤销/过期（无 sid 的存量 token 跳过此检查，平滑过渡）
      const sessionQuery = decoded.sid
        ? Session.findByPk(decoded.sid, { attributes: ['revokedAt', 'expiresAt'] })
        : Promise.resolve(null);
      const [user, session] = await Promise.all([userQuery, sessionQuery]);
      // 旧 token 无 ver 按 0 处理，与 tokenVersion 默认 0 兼容，存量会话平滑过渡
      const sessionInvalid = !!session && (!!session.revokedAt || (session.expiresAt && new Date(session.expiresAt) < new Date()));
      if (!user || user.status !== 'active' || (decoded.ver || 0) !== Number(user.tokenVersion || 0) || sessionInvalid) {
        return res.status(401).json({ code: 401, message: '凭证无效，请重新登录' });
      }
      // U1 深挖修复：JWT 不含 customerId，需以 DB 为准合并进 req.user，否则门户接口永远拿不到客户档案
      req.user = { ...decoded, customerId: user.customerId ?? decoded.customerId ?? null, mustChangePassword: !!user.mustChangePassword };
      req.sessionId = decoded.sid || null;
      req.authType = 'jwt';
      return next();
    } catch (e) {
      return res.status(401).json({ code: 401, message: '凭证无效，请重新登录' });
    }
  }

  const rawKey = req.headers['x-api-key'];
  if (rawKey) {
    try {
      const apiKey = await verifyPlainKey(rawKey);
      // 无效 / 已撤销 / 已过期一律同一文案，不向调用方透露具体原因
      if (!apiKey) {
        return res.status(401).json({ code: 401, message: '接口密钥无效或已失效' });
      }
      req.user = { id: apiKey.userId, role: apiKey.role || null, name: apiKey.name };
      req.apiKey = apiKey;
      req.authType = 'apikey';
      // 异步节流回写使用时间，不阻塞请求
      touchLastUsed(apiKey);
      return next();
    } catch (e) {
      logger.error('[AUTH] 接口密钥校验异常', { message: e.message });
      return res.status(401).json({ code: 401, message: '接口密钥无效或已失效' });
    }
  }

  return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
}

// 拒绝密钥认证：用于密钥自管理这类敏感端点
// 否则一把密钥可以自己再签发新密钥，绕过管理员对密钥生命周期的控制
function denyApiKeyAuth(req, res, next) {
  if (req.authType === 'apikey') {
    return res.status(403).json({ code: 403, message: '该操作需要管理员登录后执行，不支持接口密钥调用' });
  }
  next();
}

// 角色权限控制（兼容旧用法）
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未登录' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '无权限执行该操作' });
    }
    next();
  };
}

// P0-1 纵深防御：用户 mustChangePassword=true（默认账号首登强制改密）时，
// 除白名单端点（改密/登出/本人信息/会话/刷新）外一律 403，防止绕过前端直接调用接口。
// 默认不全局挂载（避免破坏无头测试/脚本式调用），由路由在敏感端点按需启用：
//   router.use(authRequired); router.use(forcePasswordChange); ...
function forcePasswordChange(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    const whitelist = ['change-password', 'logout', 'logout-all', 'me', 'sessions', 'refresh'];
    const requestPath = req.path.split('?')[0];
    const allowed = whitelist.some((w) => requestPath.endsWith(w));
    if (!allowed) {
      return res.status(403).json({ code: 403, message: '请先修改初始密码后再继续操作' });
    }
  }
  next();
}

// 解析当前请求的有效权限集合
// JWT 会话取用户权限；密钥调用再与密钥声明的角色求交集，保证密钥只能收窄不能提权
function resolvePermissions(req) {
  if (req.authType === 'apikey' && req.apiKey) {
    return getEffectivePermissions(req.user.id, req.apiKey.role);
  }
  return getPermissions(req.user.id);
}

// 细粒度权限校验：requirePermission(module, action)
// admin 拥有全部权限；否则校验用户角色包含的权限点
function requirePermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未登录' });
    try {
      const perms = await resolvePermissions(req);
      const need = `${module}:${action}`;
      if (perms.includes('*') || perms.includes(need) || perms.includes(`${module}:*`)) {
        return next();
      }
      return res.status(403).json({ code: 403, message: '无权限执行该操作' });
    } catch (e) {
      return next(e);
    }
  };
}

// 便捷封装：登录 + 权限一步到位
const guard = (module, action) => [authRequired, requirePermission(module, action)];

module.exports = { authRequired, denyApiKeyAuth, requireRole, requirePermission, forcePasswordChange, resolvePermissions, guard };
