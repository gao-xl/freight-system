const { User, Role, Permission } = require('../models');

// 内存缓存：userId -> [permissionCodes]
const permCache = new Map();

// 查询用户权限集合，返回 ['order:create', 'finance:read', ...]
async function getPermissions(userId) {
  const cached = permCache.get(userId);
  if (cached) return cached;
  const user = await User.findByPk(userId, {
    include: [{ model: Role, as: 'roles', include: [{ model: Permission, as: 'permissions' }] }],
  });
  if (!user) return [];
  const set = new Set();
  // admin 通配
  if (user.role === 'admin') {
    set.add('*');
  }
  for (const role of user.roles || []) {
    for (const p of role.permissions || []) {
      set.add(p.code);
      set.add(`${p.module}:*`);
    }
  }
  const perms = [...set];
  permCache.set(userId, perms);
  return perms;
}

// 权限变更时失效缓存
function invalidate(userId) {
  if (userId) permCache.delete(userId);
  else permCache.clear();
}

// 判断用户是否拥有指定权限
async function hasPermission(userId, module, action) {
  const perms = await getPermissions(userId);
  if (perms.includes('*')) return true;
  const need = `${module}:${action}`;
  return perms.includes(need) || perms.includes(`${module}:*`);
}

module.exports = { getPermissions, hasPermission, invalidate };