// 按钮级权限判定纯函数
// 支持：'*'（全权限）、精确 'module:action'、模块通配 'module:*'、空需求（放行）
export function hasPermission(perms, need) {
  if (!need) return true;
  if (!Array.isArray(perms)) return false;
  if (perms.includes('*')) return true;
  const [module, action] = need.split(':');
  // 始终返回布尔值：无 action 时前半段精确匹配已覆盖，后半段通配不展开
  return perms.includes(need) || Boolean(action) && perms.includes(`${module}:*`);
}