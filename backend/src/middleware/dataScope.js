const { Op } = require('sequelize');
const { getPermissions } = require('../services/permissionService');
const { User, UserGroup, Group } = require('../models');

// 获取用户数据权限范围 + 可访问的 groupId 集合
// 返回 { scope: 'all'|'group'|'self', groupIds: number[] }
async function resolveDataScope(userId) {
  // 读取用户全部角色，取最严格到最宽松中用户实际拥有的最高权限
  // 简化策略：admin 视为 all；否则按角色 dataScope 取最大范围
  const user = await User.findByPk(userId, {
    include: [{ model: require('../models').Role, as: 'roles' }],
  });
  if (!user) return { scope: 'self', groupIds: [NaN] };
  const roles = user.roles || [];
  // 管理员角色 code=admin 或含 * 权限 → all
  const perms = await getPermissions(userId);
  if (perms.includes('*')) return { scope: 'all', groupIds: null };

  let scope = 'self';
  for (const r of roles) {
    if (r.dataScope === 'all') scope = 'all';
    else if (r.dataScope === 'group' && scope !== 'all') scope = 'group';
    // 'self' 不覆盖更大范围
  }

  // 计算用户所属组（含主组 + UserGroup 关联 + 作为组长的组）
  const groupIds = new Set();
  if (user.groupId) groupIds.add(user.groupId);
  const ugs = await UserGroup.findAll({ where: { userId } });
  for (const ug of ugs) groupIds.add(ug.groupId);
  const ownedGroups = await Group.findAll({ where: { ownerId: userId } });
  for (const g of ownedGroups) groupIds.add(g.id);

  return { scope, groupIds: [...groupIds] };
}

// B2 数据权限中间件：注入 req.dataScope，供查询层过滤
// usage: guard('order','read') 之后，或与 guard 组合
async function dataScope(req, res, next) {
  try {
    req.dataScope = await resolveDataScope(req.user.id);
    next();
  } catch (e) {
    next(e);
  }
}

// 获取（并缓存）当前请求的数据范围：路由中间件已注入则直接复用，否则解析一次
async function getScope(req) {
  if (req.dataScope) return req.dataScope;
  req.dataScope = await resolveDataScope(req.user.id);
  return req.dataScope;
}

// 通用数据范围 where 生成器：适用于任意具备 groupId/ownerId 字段的业务模型
// 入参为 req（含 req.user.id / req.dataScope），opts: { groupCol, ownerCol } 默认 groupId / ownerId
// 仅当用户非 all 范围时生效
async function scopedWhere(req, baseWhere = {}, opts = {}) {
  const userId = req.user.id;
  const groupCol = opts.groupCol || 'groupId';
  const ownerCol = opts.ownerCol || 'ownerId';
  const { scope, groupIds } = await getScope(req);
  if (scope === 'all') return baseWhere;
  const cond = { ...baseWhere };
  if (scope === 'group') {
    cond[Op.and] = [
      ...(cond[Op.and] ? (Array.isArray(cond[Op.and]) ? cond[Op.and] : [cond[Op.and]]) : []),
      { [Op.or]: [{ [groupCol]: { [Op.in]: groupIds } }, { [groupCol]: null }] },
    ];
  } else if (scope === 'self') {
    cond[ownerCol] = userId;
  }
  return cond;
}

// 通用单条可见性查询：在已有 where（如 { id }）上叠加范围约束
async function scopedFindOne(req, model, where, include) {
  const scoped = await scopedWhere(req, where);
  return model.findOne({ where: scoped, include });
}

// 通用创建归属：为 body 自动补 groupId/ownerId（未指定时）
async function attachOwnership(req, body) {
  const me = await User.findByPk(req.user.id);
  if (!body.groupId) body.groupId = me?.groupId || null;
  if (!body.ownerId) body.ownerId = req.user.id;
  return body;
}

// 判断模型是否具备数据隔离字段（groupId 或 ownerId）
function hasScopeColumns(model) {
  return !!(model.rawAttributes && (model.rawAttributes.groupId || model.rawAttributes.ownerId));
}

// 生成订单列表查询的 where 约束（在已有 where 上扩展）
// 入参为 req（含 req.user.id / req.dataScope）
async function buildOrderScopeWhere(req, baseWhere = {}) {
  return scopedWhere(req, baseWhere);
}

// 便捷组合：鉴权 + 数据权限
const scoped = (module, action) => [dataScope];
// 注意：dataScope 需在 query 前运行，且 authRequired 在前

module.exports = { resolveDataScope, dataScope, getScope, scopedWhere, scopedFindOne, attachOwnership, hasScopeColumns, buildOrderScopeWhere, scoped };