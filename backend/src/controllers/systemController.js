const { User, Role, Permission, UserRole, AuditLog } = require('../models');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { invalidate } = require('../services/permissionService');

// 权限点列表
const permissionList = asyncHandler(async (req, res) => {
  const perms = await Permission.findAll({ order: [['module', 'ASC'], ['id', 'ASC']] });
  ok(res, perms);
});

// 用户列表（含角色）
const userList = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    attributes: { exclude: ['password'] },
    include: [{ model: Role, as: 'roles', attributes: ['id', 'code', 'name'] }],
    order: [['id', 'ASC']],
  });
  ok(res, users);
});

// 新增用户
const createUser = asyncHandler(async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { username, name, password, role, email, phone, roleIds, customerId } = req.body || {};
  if (!username || !name || !password) return fail(res, '用户名、姓名、密码不能为空');
  const exists = await User.findOne({ where: { username } });
  if (exists) return fail(res, '用户名已存在');
  // C5 客户自助门户：customer 角色必须关联客户档案
  if ((role === 'customer') && !customerId) return fail(res, '客户角色必须关联客户档案');
  const user = await User.create({
    username,
    name,
    role: role || 'operator',
    password: bcrypt.hashSync(password, 10),
    email,
    phone,
    status: 'active',
    customerId: customerId || null,
  });
  if (roleIds && roleIds.length) {
    await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }
  ok(res, user, '用户创建成功');
});

// 更新用户
const updateUser = asyncHandler(async (req, res) => {
  const bcrypt = require('bcryptjs');
  const user = await User.findByPk(req.params.id);
  if (!user) return fail(res, '用户不存在', 1, 404);
  const { name, role, email, phone, status, password, roleIds, customerId } = req.body || {};
  const patch = { name, role, email, phone, status, customerId };
  if (password) patch.password = bcrypt.hashSync(password, 10);
  await user.update(patch);
  // D8：管理员改密或禁用用户 → 递增 tokenVersion，作废该用户所有旧 token
  if (password || status === 'disabled') {
    await user.update({ tokenVersion: (user.tokenVersion || 0) + 1 });
  }
  if (roleIds) {
    await UserRole.destroy({ where: { userId: user.id } });
    if (roleIds.length) await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }
  invalidate(user.id);
  ok(res, user, '更新成功');
});

// 删除用户
const removeUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return fail(res, '用户不存在', 1, 404);
  if (user.username === 'admin') return fail(res, '内置管理员不可删除');
  await UserRole.destroy({ where: { userId: user.id } });
  await user.destroy();
  invalidate(user.id);
  ok(res, null, '删除成功');
});

// 分配用户角色
const assignRoles = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return fail(res, '用户不存在', 1, 404);
  const roleIds = (req.body?.roleIds || []).map(Number).filter(Boolean);
  await UserRole.destroy({ where: { userId: user.id } });
  if (roleIds.length) await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  invalidate(user.id);
  ok(res, null, '角色已分配');
});

// 审计日志查询：GET /system/audit-logs?module=&username=&action=&keyword=
const auditLogs = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { module, username, action } = req.query;
  const where = {};
  if (module) where.module = module;
  if (username) where.username = username;
  if (action) where.action = action;
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset,
    limit,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

module.exports = { permissionList, userList, createUser, updateUser, removeUser, assignRoles, auditLogs };