const { User, Role, Permission } = require('../models');

// 内存缓存：userId -> [permissionCodes]
const permCache = new Map();
// 内存缓存：roleCode -> [permissionCodes]
const rolePermCache = new Map();

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
      // 注意：不再为每个权限点自动展开「模块:*」。
      // 若自动展开，则拥有任一模块动作（如 order:read）的用户会拿到 order:create/delete/approve 等全部动作，
      // 造成越权（只读角色可写）。模块级通配权限必须显式注册为 module='*' 的权限点。
    }
  }
  const perms = [...set];
  permCache.set(userId, perms);
  return perms;
}

// 查询某个角色（按 Role.code）的权限集合
// 与 getPermissions 保持同样的展开规则：同时登记 `模块:动作` 与 `模块:*`
// 注意：这里不会因为 code==='admin' 就返回 '*'，角色权限严格来自 RolePermission 表
async function getRolePermissions(roleCode) {
  if (!roleCode) return [];
  const cached = rolePermCache.get(roleCode);
  if (cached) return cached;
  const role = await Role.findOne({
    where: { code: roleCode },
    include: [{ model: Permission, as: 'permissions' }],
  });
  const set = new Set();
  for (const p of (role && role.permissions) || []) {
    set.add(p.code);
  }
  const perms = [...set];
  // 角色不存在时缓存空数组：认证失败要一致地失败，不要每次请求都回查数据库
  rolePermCache.set(roleCode, perms);
  return perms;
}

// API Key 的有效权限 = 绑定用户权限 ∩ 密钥声明角色的权限
// 语义是「只能收窄，不能提权」：一把 role='viewer' 的密钥即便绑在管理员身上也只有只读权限，
// 反之绑在只读用户上的 role='admin' 密钥也拿不到管理员权限。
// roleCode 为空时退化为用户自身权限（等价于一把不做额外限制的密钥）。
async function getEffectivePermissions(userId, roleCode) {
  const userPerms = await getPermissions(userId);
  if (!roleCode) return userPerms;
  const rolePerms = await getRolePermissions(roleCode);
  // 用户是 admin（持有通配 '*'）时，交集就是角色权限本身
  if (userPerms.includes('*')) return rolePerms;
  return rolePerms.filter((p) => userPerms.includes(p) || userPerms.includes(`${p.split(':')[0]}:*`));
}

// 权限变更时失效缓存
function invalidate(userId) {
  if (userId) permCache.delete(userId);
  else permCache.clear();
  // 角色-权限映射可能同时被改动，一并失效，避免读到旧的角色权限
  rolePermCache.clear();
}

// 判断用户是否拥有指定权限
async function hasPermission(userId, module, action) {
  const perms = await getPermissions(userId);
  if (perms.includes('*')) return true;
  const need = `${module}:${action}`;
  return perms.includes(need) || perms.includes(`${module}:*`);
}

module.exports = {
  getPermissions,
  getRolePermissions,
  getEffectivePermissions,
  hasPermission,
  invalidate,
};
