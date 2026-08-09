const { Group, User, UserGroup } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { invalidate } = require('../services/permissionService');

// B2 小组列表（含成员数、组长）
const list = asyncHandler(async (req, res) => {
  const rows = await Group.findAll({
    include: [{ model: User, as: 'members', attributes: ['id', 'name', 'username'] }],
    order: [['id', 'ASC']],
  });
  ok(res, rows.map((g) => ({
    ...g.toJSON(),
    memberCount: (g.members || []).length,
    ownerName: (g.members || []).find((m) => m.id === g.ownerId)?.name || null,
  })));
});

// 小组详情（含额外成员 UserGroup）
const get = asyncHandler(async (req, res) => {
  const g = await Group.findByPk(req.params.id, {
    include: [
      { model: User, as: 'members', attributes: ['id', 'name', 'username'] },
      { model: User, as: 'userMembers', attributes: ['id', 'name', 'username'] },
    ],
  });
  if (!g) return fail(res, '小组不存在', 1, 404);
  ok(res, g);
});

const create = asyncHandler(async (req, res) => {
  const { name, code, description, ownerId } = req.body;
  if (!name) return fail(res, '小组名称必填');
  const exists = code ? await Group.findOne({ where: { code } }) : null;
  if (exists) return fail(res, '小组编码已存在');
  const g = await Group.create({ name, code, description, ownerId, status: 'active' });
  ok(res, g, '创建成功');
});

const update = asyncHandler(async (req, res) => {
  const g = await Group.findByPk(req.params.id);
  if (!g) return fail(res, '小组不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  await g.update(body);
  invalidate(); // D12 组信息变更（含组长/归属）→ 清权限缓存
  ok(res, g, '更新成功');
});

const remove = asyncHandler(async (req, res) => {
  const g = await Group.findByPk(req.params.id);
  if (!g) return fail(res, '小组不存在', 1, 404);
  await UserGroup.destroy({ where: { groupId: g.id } });
  await g.destroy();
  invalidate(); // D12 删组影响组长/成员归属 → 清权限缓存
  ok(res, null, '删除成功');
});

// 小组添加成员（UserGroup 关联）
const addMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) return fail(res, '缺少 userId');
  const g = await Group.findByPk(req.params.id);
  if (!g) return fail(res, '小组不存在', 1, 404);
  const exists = await UserGroup.findOne({ where: { groupId: g.id, userId } });
  if (exists) return ok(res, null, '成员已存在');
  await UserGroup.create({ groupId: g.id, userId });
  invalidate(); // D12 成员集合变更 → 清权限缓存
  ok(res, null, '添加成员成功');
});

// 移除小组成员
const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await UserGroup.destroy({ where: { groupId: req.params.id, userId } });
  invalidate(); // D12 成员集合变更 → 清权限缓存
  ok(res, null, '移除成员成功');
});

// 小组用户可选项（供创建订单归属时选择）
const members = asyncHandler(async (req, res) => {
  const users = await User.findAll({ where: { status: 'active' }, attributes: ['id', 'name', 'username', 'groupId'] });
  ok(res, users);
});

module.exports = { list, get, create, update, remove, addMember, removeMember, members };