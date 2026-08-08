// Onboarding 引导系统控制器（Spec v2.1 §5 + 设计细化 §2）
// 职责：
//   - GET    /api/onboarding/status     空态判定权威源（各资源 count + companyConfigured，需登录）
//   - POST   /api/onboarding/demo-data  一键生成示例数据（事务 + 表空校验，需 admin）
//   - DELETE /api/onboarding/demo-data  清空示例数据（按 isDemo + 批次，需 admin）
//   - POST   /api/onboarding/wizard/done 标记向导完成（MVP 用 localStorage，接口预留，需登录）
//   - GET    /api/system/init-status    初始化状态（公开，无需登录）
//   - POST   /api/system/setup-admin    创建首个管理员（公开，仅 Users 表为空时可调）
// 旧路径 /api/system/demo-data 保留为兼容别名（routes/index.js 挂载）

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Role } = require('../models');
const UserRole = require('../models/UserRole');
const config = require('../config');
const { ok, fail, asyncHandler } = require('../utils/response');
const { getInitStatus } = require('../services/bootstrapService');
const { generateDemoData, clearDemoData, getOnboardingStatus } = require('../services/demoDataService');
const { getPermissions, invalidate } = require('../services/permissionService');

// 初始化状态（公开）：前端据此决定跳 /setup-admin（无管理员）或 /login
const initStatus = asyncHandler(async (req, res) => {
  const status = await getInitStatus();
  ok(res, status);
});

// 创建首个管理员（公开，仅空库可调；成功后该端点立即失效）
const setupAdmin = asyncHandler(async (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) return fail(res, '用户名和密码不能为空');
  if (String(username).length < 2 || String(username).length > 50) return fail(res, '用户名长度需为 2-50 位');
  if (String(password).length < 6) return fail(res, '密码至少 6 位');
  if (!name) return fail(res, '请填写管理员姓名');

  const status = await getInitStatus();
  if (!status.needsSetup) return fail(res, '系统已完成初始化，请直接登录', 1, 409);

  // 事务内二次校验，防并发重复创建
  const user = await User.sequelize.transaction(async (t) => {
    const count = await User.count({ transaction: t });
    if (count > 0) throw Object.assign(new Error('系统已完成初始化'), { status: 409 });
    const adminRole = await Role.findOne({ where: { code: 'admin' } });
    const created = await User.create({
      username: String(username).trim(),
      name: String(name).trim() || '管理员',
      role: 'admin',
      password: bcrypt.hashSync(String(password), 10),
      status: 'active',
      mustChangePassword: false, // 向导内自行设置的密码，无需二次改密
    }, { transaction: t });
    if (adminRole) {
      await UserRole.create({ userId: created.id, roleId: adminRole.id }, { transaction: t });
    }
    return created;
  });

  invalidate(user.id);
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role, ver: user.tokenVersion || 0, jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  const permissions = await getPermissions(user.id);
  ok(res, {
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions, mustChangePassword: false },
  }, '初始化完成，欢迎使用');
});

/**
 * @openapi
 * /api/onboarding/status:
 *   get:
 *     tags: [Onboarding]
 *     summary: 空态判定权威源
 *     description: |
 *       返回各核心资源的记录数（count）与公司是否已配置（companyConfigured）。
 *       Checklist 进度、EmptyGuide 空态、F6 上下文提醒均以此接口为唯一判定来源；
 *       不建独立状态表，进度全部派生自真实数据。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 各资源计数与公司配置状态
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
 *                         customers: { type: integer, example: 0 }
 *                         quotations: { type: integer, example: 0 }
 *                         orders: { type: integer, example: 0 }
 *                         bookings: { type: integer, example: 0 }
 *                         declarations: { type: integer, example: 0 }
 *                         financeRecords: { type: integer, example: 0 }
 *                         freightRates: { type: integer, example: 0 }
 *                         companyConfigured: { type: boolean, example: false }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 已认证但无权限
 */
const status = asyncHandler(async (req, res) => {
  const s = await getOnboardingStatus();
  ok(res, s);
});

/**
 * @openapi
 * /api/onboarding/demo-data:
 *   post:
 *     tags: [Onboarding]
 *     summary: 一键生成示例数据
 *     description: |
 *       事务生成完整演示闭环：3 客户 / 3 报价(含明细) / 2 订单(一海运一空运, 含提单三要素) / 1 订舱 /
 *       1 报关 / 4 财务流水 / 1 运价表，全部标记 isDemo=true 并登记批次（DemoDataLogs）。
 *       幂等：生成前先清空存量 isDemo 数据（先清后建）。
 *       安全护栏：仅 admin；只在相关业务表全空时允许生成（count 校验，绝不 force sync）；
 *       任意表已有非演示数据则拒绝（409）。生产环境由前端隐藏入口。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 生成成功，返回批次号与各表计数
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
 *                         batchId: { type: string }
 *                         counts: { type: object }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 *       '409':
 *         description: 已有业务数据，拒绝生成（count 校验未通过）
 *   delete:
 *     tags: [Onboarding]
 *     summary: 清空示例数据
 *     description: |
 *       仅删除 isDemo=true 的记录，按 DemoDataLogs 批次追踪；真实数据不受影响（事务）。
 *       清空后将批次标记 isCleared=true（保留审计，不物理删除批次记录）。
 *       返回删除的记录总数。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 清空完成，返回删除条数
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
 *                         deleted: { type: integer }
 *       '401':
 *         description: 未登录或凭证无效
 *       '403':
 *         description: 无 admin 权限
 */
const createDemoData = asyncHandler(async (req, res) => {
  const result = await generateDemoData();
  ok(res, result, '示例数据已生成（带演示标记，可一键清空）');
});

const removeDemoData = asyncHandler(async (req, res) => {
  const deleted = await clearDemoData();
  ok(res, { deleted }, '示例数据已清空');
});

/**
 * @openapi
 * /api/onboarding/wizard/done:
 *   post:
 *     tags: [Onboarding]
 *     summary: 标记向导完成（接口预留）
 *     description: |
 *       MVP 阶段向导完成状态存前端 localStorage，本接口预留以便后续迁移 UserPreference 表。
 *       当前实现不落库，恒返回 { ok: true }。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 恒成功
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
 *                         ok: { type: boolean, example: true }
 *       '401':
 *         description: 未登录或凭证无效
 */
const wizardDone = asyncHandler(async (req, res) => {
  ok(res, { ok: true }, '向导完成状态已记录（本地存储）');
});

module.exports = { initStatus, setupAdmin, status, createDemoData, removeDemoData, wizardDone };
