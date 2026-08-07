const jwt = require('jsonwebtoken');
const config = require('../config');
const { getPermissions } = require('../services/permissionService');

// JWT 鉴权
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '凭证无效，请重新登录' });
  }
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

// 细粒度权限校验：requirePermission(module, action)
// admin 拥有全部权限；否则校验用户角色包含的权限点
function requirePermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未登录' });
    const perms = await getPermissions(req.user.id);
    const need = `${module}:${action}`;
    if (perms.includes('*') || perms.includes(need) || perms.includes(`${module}:*`)) {
      return next();
    }
    return res.status(403).json({ code: 403, message: '无权限执行该操作' });
  };
}

// 便捷封装：登录 + 权限一步到位
const guard = (module, action) => [authRequired, requirePermission(module, action)];

module.exports = { authRequired, requireRole, requirePermission, guard };