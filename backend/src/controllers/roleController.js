const { Role, Permission, UserRole, RolePermission } = require('../models');
const { ok, fail, asyncHandler } = require('../utils/response');
const { invalidate } = require('../services/permissionService');

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
  if (['all', 'group', 'self'].includes(dataScope)) patch.dataScope = dataScope; // B2
  await role.update(patch);
  invalidate();
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
  invalidate();
  const updated = await Role.findByPk(role.id, { include: [{ model: Permission, as: 'permissions' }] });
  ok(res, updated, '权限已更新');
});

// 轻量事务封装，避免循环依赖 models 的 sequelize 导出
const { sequelize } = require('../models');
async function sequelizeTx(fn) {
  return sequelize.transaction(fn);
}

module.exports = { list, create, update, remove, assignPermissions };