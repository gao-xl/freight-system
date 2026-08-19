const { User, Role, Permission, UserRole, AuditLog, CompanyProfile } = require('../services/dataAccess');
const sequelize = require('../db');
const { Op } = require('sequelize');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { validatePassword } = require('../utils/passwordPolicy');
const { invalidate, hasPermission } = require('../services/permissionService');
const apiKeyService = require('../services/apiKeyService');
const { collectHealth } = require('../services/healthCheck');
const { collectSecurity } = require('../services/securityCheck');
const auditService = require('../core/auditService'); // A3 加固：权限变更审计留痕

// M4 修复：管理操作提权约束辅助函数
// 只有「系统管理员」可授予/撤销 admin 角色或把用户设为 admin；普通持有 system:user 的运维不可提权。
const isAdmin = (req) => hasPermission(req.user.id, 'system', '*');
// 解析 admin 角色 id（供 roleIds 场景判断）
async function adminRoleIds() {
  const adminRole = await Role.findOne({ where: { code: 'admin' } });
  return adminRole ? [adminRole.id] : [];
}
// 判断用户当前是否身兼 admin 角色（含 User.role='admin' 或 roleIds 指向 admin 角色）
async function isAdminUser(userId) {
  const perms = await hasPermission(userId, 'system', '*');
  if (perms) return true;
  const ur = await UserRole.findAll({ where: { userId } });
  const adminIds = await adminRoleIds();
  return ur.some((r) => adminIds.includes(r.roleId));
}
// 保护「最后一名管理员」：要求除了被操作对象外，仍存在至少一名启用的 admin 用户
async function ensureOtherAdmin(exceptUserId) {
  const { Op } = require('sequelize');
  const adminIds = await adminRoleIds();
  // 收集所有 admin 用户 id
  const adminUserIds = new Set();
  const byRoleField = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  for (const u of byRoleField) adminUserIds.add(Number(u.id));
  if (adminIds.length) {
    const ur = await UserRole.findAll({ where: { roleId: { [Op.in]: adminIds } } });
    for (const r of ur) adminUserIds.add(Number(r.userId));
  }
  // 排除被操作对象后，其余 admin 用户是否至少有一个启用
  const others = [...adminUserIds].filter((id) => id !== Number(exceptUserId));
  if (!others.length) return { message: '系统至少需要保留一名管理员' };
  const activeOthers = await User.count({ where: { id: { [Op.in]: others }, status: 'active' } });
  if (activeOthers === 0) return { message: '系统至少需要保留一名启用的管理员' };
  return null;
}

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
  const pw = validatePassword(password);
  if (!pw.ok) return fail(res, pw.message);
  const exists = await User.findOne({ where: { username } });
  if (exists) return fail(res, '用户名已存在');
  // M4 修复：非管理员不得创建 admin 用户或授予 admin 角色
  if (role === 'admin' && !(await isAdmin(req))) return fail(res, '仅管理员可创建管理员账号', 1, 403);
  if (roleIds && roleIds.length) {
    const adminIds = await adminRoleIds();
    if (roleIds.map(Number).some((id) => adminIds.includes(id)) && !(await isAdmin(req))) {
      return fail(res, '仅管理员可授予管理员角色', 1, 403);
    }
  }
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
  const { name, role, email, phone, status, password, roleIds, customerId, twoFactorEnabled } = req.body || {};
  // M4 修复：提权校验——非管理员不得把用户设为 admin 或授予 admin 角色
  const wasAdmin = await isAdminUser(user.id);
  const adminIds = await adminRoleIds();
  const targetAdminField = role === 'admin';
  const roleIdsProvided = roleIds !== undefined;
  const roleIdsGrantAdmin = roleIdsProvided ? roleIds.map(Number).some((id) => adminIds.includes(id)) : null;
  if ((targetAdminField || roleIdsGrantAdmin) && !(await isAdmin(req))) {
    return fail(res, '仅管理员可授予管理员权限', 1, 403);
  }
  // 本次操作若会使该用户失去 admin 权限，需确保仍有其它启用管理员
  if (wasAdmin) {
    let losesAdmin = false;
    if (role !== undefined && role !== 'admin') losesAdmin = true;
    if (roleIdsProvided && !roleIdsGrantAdmin) losesAdmin = true;
    if (losesAdmin) {
      const err = await ensureOtherAdmin(user.id);
      if (err) return fail(res, err.message, 1, 400);
    }
  }
  const patch = { name, role, email, phone, status, customerId };
  if (twoFactorEnabled !== undefined) patch.twoFactorEnabled = !!twoFactorEnabled;
  if (password) {
    const pw = validatePassword(password);
    if (!pw.ok) return fail(res, pw.message);
    patch.password = bcrypt.hashSync(password, 10);
  }
  await user.update(patch);
  let needsTokenReset = !!(password || status === 'disabled');
  if (roleIds) {
    await UserRole.destroy({ where: { userId: user.id } });
    if (roleIds.length) await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
    // L6 修复：角色变更递增 tokenVersion，使旧 token 立即失效
    needsTokenReset = true;
  }
  if (needsTokenReset) {
    await user.update({ tokenVersion: (user.tokenVersion || 0) + 1 });
  }
  // P1 修复：账号被禁用或密码被重置时，吊销其全部接口密钥，使长期凭据随之失效
  if (status === 'disabled' || password) {
    await apiKeyService.revokeAllForUser(user.id);
  }
  invalidate(user.id);
  ok(res, user, '更新成功');
});

// 删除用户
const removeUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return fail(res, '用户不存在', 1, 404);
  if (user.username === 'admin') return fail(res, '内置管理员不可删除');
  // M4 修复：删除管理员前需保证仍有其它启用管理员
  if (await isAdminUser(user.id)) {
    const err = await ensureOtherAdmin(user.id);
    if (err) return fail(res, err.message, 1, 400);
  }
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
  const adminIds = await adminRoleIds();
  // M4 修复：非管理员不得授予 admin 角色
  if (roleIds.some((id) => adminIds.includes(id)) && !(await isAdmin(req))) {
    return fail(res, '仅管理员可授予管理员角色', 1, 403);
  }
  // 移除 admin 时的最后管理员保护
  const wasAdmin = await isAdminUser(user.id);
  const grantsAdmin = roleIds.some((id) => adminIds.includes(id));
  if (wasAdmin && !grantsAdmin) {
    const err = await ensureOtherAdmin(user.id);
    if (err) return fail(res, err.message, 1, 400);
  }
  await UserRole.destroy({ where: { userId: user.id } });
  if (roleIds.length) await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  // L6 修复：角色变更递增 tokenVersion，使旧 token 立即失效
  await user.update({ tokenVersion: (user.tokenVersion || 0) + 1 });
  invalidate(user.id);
  // A3 审计：用户角色分配是权限体系关键操作，须留痕
  await auditService.record({
    userId: req.user?.id, username: req.user?.username, module: 'system', action: 'assign_roles',
    targetId: user.id, summary: `为用户 #${user.id}(${user.username}) 分配角色: [${roleIds.join(',')}]`,
  });
  ok(res, null, '角色已分配');
});

// 审计日志查询：GET /system/audit-logs?module=&username=&action=&startDate=&endDate=
const auditLogs = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { module, username, action, startDate, endDate } = req.query;
  const where = {};
  if (module) where.module = module;
  if (username) where.username = username;
  if (action) where.action = action;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate);
    if (endDate) where.createdAt[Op.lte] = new Date(endDate + 'T23:59:59.999Z');
  }
  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset,
    limit,
  });
  // 汇总统计（不翻页，基于当前筛选条件）
  const stats = await AuditLog.findAll({
    attributes: ['module', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    where,
    group: ['module'],
    raw: true,
  });
  ok(res, { list: rows, total: count, page, pageSize, stats: stats.map((s) => ({ module: s.module, count: Number(s.cnt) })) });
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
 * /api/system/security-check:
 *   post:
 *     tags: [系统]
 *     summary: 系统安全检测（三态）
 *     description: |
 *       聚合多项安全配置检查：监听地址暴露 / 反向代理覆盖 / 数据库端口暴露 / 防火墙 /
 *       JWT 密钥强度 / 登录锁定 / 强制改密 / HTTPS / 数据库认证 / admin 默认密码。
 *       每项返回 status: ok|warn|fail + detail + fix。
 *       detail 与 fix 不泄露密钥明文与敏感路径。summary 取最差状态。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 安全检测结果
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
 *                         failCount: { type: integer }
 *                         warnCount: { type: integer }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 */
const securityCheck = asyncHandler(async (req, res) => {
  const data = await collectSecurity();
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

// 能力开关（登录即可）：暴露 PDF 渲染模式给前端，PDF 关闭时前端可隐藏/禁用打印按钮并给出提示
// 前端频繁调用，返回轻量、无敏感信息
const capabilities = (req, res) => {
  const renderer = require('../config').pdf.renderer;
  ok(res, { pdf: { renderer, enabled: renderer !== 'off' } });
};

// S4 ── 安全设置（2FA 开关 + SMTP 配置）──
// 读取安全设置：2FA 开关 + SMTP（密码仅返回是否已配置，不回显原文）
const getSecuritySettings = asyncHandler(async (req, res) => {
  const profile = await CompanyProfile.findOne();
  ok(res, {
    security: {
      enabled: !!(profile && profile.security2faEnabled),
      emailEnabled: !!(profile && profile.securityEmailEnabled),
      totpEnabled: !!(profile && profile.securityTotpEnabled),
    },
    smtp: {
      host: (profile && profile.smtpHost) || '',
      port: (profile && profile.smtpPort) || 465,
      user: (profile && profile.smtpUser) || '',
      from: (profile && profile.smtpFrom) || '',
      passConfigured: !!(profile && profile.smtpPassEnc),
    },
  });
});

// 写入安全设置：2FA 开关 + SMTP（密码经 AES 加密存储）
const putSecuritySettings = asyncHandler(async (req, res) => {
  const { encryptSecret } = require('../utils/crypto');
  const { security, smtp } = req.body || {};
  let profile = await CompanyProfile.findOne();
  if (!profile) profile = await CompanyProfile.create({ companyName: '' });
  if (security) {
    if (security.enabled !== undefined) profile.security2faEnabled = !!security.enabled;
    if (security.emailEnabled !== undefined) profile.securityEmailEnabled = !!security.emailEnabled;
    if (security.totpEnabled !== undefined) profile.securityTotpEnabled = !!security.totpEnabled;
  }
  if (smtp) {
    if (smtp.host !== undefined) profile.smtpHost = String(smtp.host || '').trim();
    if (smtp.port !== undefined) {
      const p = Number(smtp.port);
      profile.smtpPort = Number.isInteger(p) && p > 0 ? p : null;
    }
    if (smtp.user !== undefined) profile.smtpUser = String(smtp.user || '').trim();
    if (smtp.pass !== undefined && smtp.pass !== '') profile.smtpPassEnc = encryptSecret(String(smtp.pass));
    if (smtp.from !== undefined) profile.smtpFrom = String(smtp.from || '').trim();
  }
  await profile.save();
  ok(res, null, '安全设置已保存');
});

// 测试发信：用表单提交的 SMTP 值（未落库）试发，成功才提示保存
const smtpTest = asyncHandler(async (req, res) => {
  const nodemailer = require('nodemailer');
  const { smtp, to } = req.body || {};
  const host = String((smtp && smtp.host) || '').trim();
  if (!host) return fail(res, '请填写 SMTP 服务器地址');
  const port = Number((smtp && smtp.port) || 465);
  const user = String((smtp && smtp.user) || '').trim();
  const pass = String((smtp && smtp.pass) || '').trim();
  const from = String((smtp && smtp.from) || '').trim() || (user ? `货代系统 <${user}>` : '');
  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });
    await transporter.sendMail({
      from,
      to: to || (req.user && req.user.email) || '',
      subject: '【货代系统】SMTP 配置测试',
      text: `测试邮件发送成功：SMTP 配置可用（${new Date().toISOString()}）。`,
    });
    ok(res, null, '测试邮件发送成功');
  } catch (e) {
    fail(res, `测试发信失败：${String(e.message || e).slice(0, 200)}`, 1, 400);
  }
});

module.exports = {
  permissionList, userList, createUser, updateUser, removeUser, assignRoles, auditLogs,
  health, securityCheck, getDefaults, putDefaults, capabilities,
  getSecuritySettings, putSecuritySettings, smtpTest,
};