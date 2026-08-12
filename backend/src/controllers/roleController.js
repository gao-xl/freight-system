const { Role, Permission, UserRole, RolePermission, User } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { invalidate, hasPermission } = require('../services/permissionService');

// M4/L6 修复辅助：角色权限/数据范围变更后，立即作废持有该角色用户的旧 token
async function bumpRoleUsersTokenVersion(roleId) {
  const { Op } = require('sequelize');
  const users = await UserRole.findAll({ where: { roleId }, attributes: ['userId'] });
  const ids = users.map((u) => u.userId).filter(Boolean);
  if (!ids.length) return;
  await User.update({ tokenVersion: sequelize.literal('"tokenVersion" + 1') }, { where: { id: { [Op.in]: ids } } });
  for (const id of ids) invalidate(id);
}

// 角色列表（含权限）
const list = asyncHandler(async (req, res) => {
  const roles = await Role.findAll({
    include: [{ model: Permission, as: 'permissions', attributes: ['id', 'code', 'module', 'action', 'name'] }],
    order: [['id', 'ASC']],
  });
  ok(res, roles);
});

const create = asyncHandler(async (req, res) => {
  const { code, name, description } = req.body || {};
  if (!code || !name) return fail(res, '角色编码和名称不能为空');
  const exists = await Role.findOne({ where: { code } });
  if (exists) return fail(res, '角色编码已存在');
  const role = await Role.create({ code, name, description });
  ok(res, role, '角色创建成功');
});

const update = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return fail(res, '角色不存在', 1, 404);
  const { name, description, dataScope } = req.body || {};
  const patch = { name, description };
  // B2：数据范围走白名单
  if (['all', 'group', 'self'].includes(dataScope)) patch.dataScope = dataScope;
  // M4 修复：仅管理员可将角色数据范围设为 'all'，防止持有 system:role 的非管理员借此放大数据可达范围
  if ((patch.dataScope === 'all') && !(await hasPermission(req.user.id, 'system', '*'))) {
    return fail(res, '仅管理员可授予全库数据范围', 1, 403);
  }
  // M4 修复：内置 admin 角色必须保持 dataScope='all'，禁止收窄
  if (role.code === 'admin' && patch.dataScope !== undefined && patch.dataScope !== 'all') {
    return fail(res, '内置管理员角色的数据范围不可修改', 1, 400);
  }
  const scopeChanged = patch.dataScope !== undefined && patch.dataScope !== role.dataScope;
  await role.update(patch);
  // L6 修复：数据范围变更会改变该角色下所有用户的可见行——立即作废旧 token
  if (scopeChanged) await bumpRoleUsersTokenVersion(role.id);
  else invalidate();
  ok(res, role, '更新成功');
});

const remove = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return fail(res, '角色不存在', 1, 404);
  if (role.isSystem) return fail(res, '系统内置角色不可删除');
  await RolePermission.destroy({ where: { roleId: role.id } });
  await UserRole.destroy({ where: { roleId: role.id } });
  await role.destroy();
  invalidate();
  ok(res, null, '删除成功');
});

// 分配权限（整体覆盖）
const assignPermissions = asyncHandler(async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return fail(res, '角色不存在', 1, 404);
  const ids = (req.body?.permissionIds || []).map(Number).filter(Boolean);
  await sequelizeTx(async (t) => {
    await RolePermission.destroy({ where: { roleId: role.id }, transaction: t });
    if (ids.length) {
      await RolePermission.bulkCreate(ids.map((permissionId) => ({ roleId: role.id, permissionId })), { transaction: t });
    }
  });
  // L6 修复：权限变更立即作废该角色下所有用户的旧 token，防止旧权限延续
  await bumpRoleUsersTokenVersion(role.id);
  const updated = await Role.findByPk(role.id, { include: [{ model: Permission, as: 'permissions' }] });
  ok(res, updated, '权限已更新');
});

// 轻量事务封装，避免循环依赖 models 的 sequelize 导出
const { sequelize } = require('../services/dataAccess');
async function sequelizeTx(fn) {
  return sequelize.transaction(fn);
}

module.exports = { list, create, update, remove, assignPermissions };