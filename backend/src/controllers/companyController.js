const { CompanyProfile, Department, CompanyAccount, InvoiceTitle, User } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');

// ============ 公司基本信息（单行，id=1） ============
const getProfile = asyncHandler(async (req, res) => {
  let p = await CompanyProfile.findByPk(1);
  if (!p) {
    p = await CompanyProfile.create({ id: 1, companyName: '' });
  }
  ok(res, p);
});

const saveProfile = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  let p = await CompanyProfile.findByPk(1);
  if (!p) {
    p = await CompanyProfile.create({ id: 1, companyName: body.companyName || '' });
  }
  await p.update(body);
  ok(res, p, '保存成功');
});

// ============ 部门 ============
const listDepartments = asyncHandler(async (req, res) => {
  const rows = await Department.findAll({ order: [['sort', 'ASC'], ['id', 'ASC']] });
  const leaderIds = [...new Set(rows.map((r) => r.leaderId).filter(Boolean))];
  const users = leaderIds.length ? await User.findAll({ where: { id: { [Op.in]: leaderIds } }, attributes: ['id', 'name'] }) : [];
  const umap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  ok(res, rows.map((r) => ({ ...r.toJSON(), leaderName: umap[r.leaderId] || null })));
});

const createDepartment = asyncHandler(async (req, res) => {
  const { name, code, parentId, leaderId, sort } = req.body;
  if (!name) return fail(res, '部门名称必填');
  if (code) {
    const exists = await Department.findOne({ where: { code } });
    if (exists) return fail(res, '部门编码已存在');
  }
  const d = await Department.create({ name, code, parentId: parentId || 0, leaderId, sort: sort || 0, status: 'active' });
  ok(res, d, '创建成功');
});

const updateDepartment = asyncHandler(async (req, res) => {
  const d = await Department.findByPk(req.params.id);
  if (!d) return fail(res, '部门不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  if (body.code && body.code !== d.code) {
    const exists = await Department.findOne({ where: { code: body.code, id: { [Op.ne]: d.id } } });
    if (exists) return fail(res, '部门编码已存在');
  }
  await d.update(body);
  ok(res, d, '更新成功');
});

const removeDepartment = asyncHandler(async (req, res) => {
  const d = await Department.findByPk(req.params.id);
  if (!d) return fail(res, '部门不存在', 1, 404);
  const child = await Department.findOne({ where: { parentId: d.id } });
  if (child) return fail(res, '存在下级部门，无法删除');
  await d.destroy();
  ok(res, null, '删除成功');
});

// ============ 公司银行账号 ============
const listAccounts = asyncHandler(async (req, res) => {
  const rows = await CompanyAccount.findAll({ order: [['isDefault', 'DESC'], ['id', 'ASC']] });
  ok(res, rows);
});

const createAccount = asyncHandler(async (req, res) => {
  const { accountName, accountNo } = req.body;
  if (!accountName || !accountNo) return fail(res, '户名与账号必填');
  const a = await CompanyAccount.create({ ...req.body, status: 'active' });
  if (a.isDefault) await CompanyAccount.update({ isDefault: false }, { where: { id: { [Op.ne]: a.id } } });
  ok(res, a, '创建成功');
});

const updateAccount = asyncHandler(async (req, res) => {
  const a = await CompanyAccount.findByPk(req.params.id);
  if (!a) return fail(res, '账号不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  await a.update(body);
  if (body.isDefault) await CompanyAccount.update({ isDefault: false }, { where: { id: { [Op.ne]: a.id } } });
  ok(res, a, '更新成功');
});

const removeAccount = asyncHandler(async (req, res) => {
  const a = await CompanyAccount.findByPk(req.params.id);
  if (!a) return fail(res, '账号不存在', 1, 404);
  await a.destroy();
  ok(res, null, '删除成功');
});

// ============ 开票/单证抬头 ============
const listTitles = asyncHandler(async (req, res) => {
  const rows = await InvoiceTitle.findAll({ order: [['isDefault', 'DESC'], ['id', 'ASC']] });
  ok(res, rows);
});

const createTitle = asyncHandler(async (req, res) => {
  const { titleName } = req.body;
  if (!titleName) return fail(res, '抬头名称必填');
  const t = await InvoiceTitle.create({ ...req.body, status: 'active' });
  if (t.isDefault) await InvoiceTitle.update({ isDefault: false }, { where: { id: { [Op.ne]: t.id } } });
  ok(res, t, '创建成功');
});

const updateTitle = asyncHandler(async (req, res) => {
  const t = await InvoiceTitle.findByPk(req.params.id);
  if (!t) return fail(res, '抬头不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  await t.update(body);
  if (body.isDefault) await InvoiceTitle.update({ isDefault: false }, { where: { id: { [Op.ne]: t.id } } });
  ok(res, t, '更新成功');
});

const removeTitle = asyncHandler(async (req, res) => {
  const t = await InvoiceTitle.findByPk(req.params.id);
  if (!t) return fail(res, '抬头不存在', 1, 404);
  await t.destroy();
  ok(res, null, '删除成功');
});

module.exports = {
  getProfile, saveProfile,
  listDepartments, createDepartment, updateDepartment, removeDepartment,
  listAccounts, createAccount, updateAccount, removeAccount,
  listTitles, createTitle, updateTitle, removeTitle,
};