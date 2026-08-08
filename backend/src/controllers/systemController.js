const { User, Role, Permission, UserRole, AuditLog, CompanyProfile } = require('../models');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { invalidate } = require('../services/permissionService');
const { collectHealth } = require('../services/healthCheck');

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

// ---------- Onboarding 系统健康与默认设置（Spec §5） ----------

/**
 * @openapi
 * /api/system/health:
 *   get:
 *     tags: [系统]
 *     summary: 系统健康检查（三态）
 *     description: |
 *       聚合 Node 运行时 / 磁盘剩余 / 端口可达 / 数据目录可写 / 数据库可达 / 迁移状态。
 *       每项返回 status: ok|warn|fail + detail + fix（可复制命令）。
 *       detail 与 fix 不泄露敏感路径与密钥：数据目录以语义描述表示，不含真实路径。
 *       summary 取最差状态：任一 fail 为 fail，否则任一 warn 为 warn，全部 ok 为 ok。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 健康检查结果
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         checks:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               item: { type: string }
 *                               status: { type: string, enum: [ok, warn, fail] }
 *                               detail: { type: string }
 *                               fix: { type: string, nullable: true }
 *                         summary: { type: string, enum: [ok, warn, fail] }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 */
const health = asyncHandler(async (req, res) => {
  const data = await collectHealth();
  ok(res, data);
});

/**
 * @openapi
 * /api/system/defaults:
 *   get:
 *     tags: [系统]
 *     summary: 读取系统默认设置
 *     description: MVP 仅返回 defaultCurrency（默认币种），数据源 CompanyProfile（单行 id=1）。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 默认设置
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         defaultCurrency: { type: string, example: CNY }
 *       '401':
 *         description: 未登录或凭证无效
 *   put:
 *     tags: [系统]
 *     summary: 更新系统默认设置
 *     description: 写入 CompanyProfile.defaultCurrency（ISO 4217 三位大写，如 CNY/USD/EUR）。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [defaultCurrency]
 *             properties:
 *               defaultCurrency: { type: string, example: CNY }
 *     responses:
 *       '200':
 *         description: 更新后的默认设置
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         defaultCurrency: { type: string, example: CNY }
 *       '400':
 *         description: 币种格式不合法
 *       '401':
 *         description: 未登录或凭证无效
 */
const getDefaults = asyncHandler(async (req, res) => {
  const profile = await CompanyProfile.findOne();
  ok(res, { defaultCurrency: (profile && profile.defaultCurrency) || 'CNY' });
});

const putDefaults = asyncHandler(async (req, res) => {
  const { defaultCurrency } = req.body || {};
  const cur = String(defaultCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return fail(res, '币种格式不合法（需为 ISO 4217 三位大写字母，如 CNY/USD/EUR）', 1, 400);
  let profile = await CompanyProfile.findOne();
  if (!profile) profile = await CompanyProfile.create({ companyName: '' });
  profile.defaultCurrency = cur;
  await profile.save();
  ok(res, { defaultCurrency: profile.defaultCurrency }, '默认设置已更新');
});

module.exports = {
  permissionList, userList, createUser, updateUser, removeUser, assignRoles, auditLogs,
  health, getDefaults, putDefaults,
};