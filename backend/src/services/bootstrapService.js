// 启动自检（ensureBootstrap）：空表时幂等预置基础数据，绝不触碰已有数据
// 原则：与"订单状态是派生的"一致——引导进度/初始化状态均派生自真实数据，不建独立状态表
// 职责：
//   1. Permissions 空 → 预置全量权限点（rbac.js 同源）
//   2. Roles 空 → 预置内置角色
//   3. RolePermissions 空 → 预置角色权限映射
//   4. ExchangeRate 无 USD 基准 → 预置 USD→CNY 基准汇率（引导 Wizard 默认币种数据源）
//   5. Users 空：
//      - 设置 ADMIN_INIT_PASSWORD → 创建 admin（mustChangePassword=true，首登强制改密）
//      - 未设置 → 不创建账号，返回 needsSetup=true（前端引导创建首个管理员）

const bcrypt = require('bcryptjs');
const { sequelize, User, Role, Permission, RolePermission, ExchangeRate } = require('../models');
const { buildPermissions, buildRoles, buildRolePermissionMap } = require('../seedData/rbac');
const { invalidate } = require('./permissionService');
const { logger } = require('../utils/logger');
const config = require('../config');

// 预置 RBAC：按"缺什么补什么"独立幂等播种，避免全新重建（migration 链）后
// 因补充权限迁移残留部分权限点导致角色/映射被整体跳过。
//   - 权限点：空则全量播种；非空则补齐基线中缺失的权限点（按 code 去重）
//   - 角色：空则播种内置角色
//   - 角色权限映射：空则按角色/权限现状重建
// 全程幂等，绝不删除/覆盖已有数据。
async function seedRbac() {
  const [permCount, roleCount, rpCount] = await Promise.all([
    Permission.count(),
    Role.count(),
    RolePermission.count(),
  ]);

  const PERMS = buildPermissions();

  // 1) 权限点
  let perms = await Permission.findAll({ raw: true });
  if (permCount === 0) {
    await Permission.bulkCreate(PERMS);
    perms = await Permission.findAll({ raw: true });
    logger.info(`[BOOTSTRAP] 预置权限点 ${perms.length} 个`);
  } else {
    const existingCodes = new Set(perms.map((p) => p.code));
    const missing = PERMS.filter((p) => !existingCodes.has(p.code));
    if (missing.length) {
      await Permission.bulkCreate(missing);
      perms = await Permission.findAll({ raw: true });
      logger.info(`[BOOTSTRAP] 补齐缺失权限点 ${missing.length} 个`);
    }
  }

  // 2) 角色
  let roles = await Role.findAll({ raw: true });
  if (roles.length === 0) {
    await Role.bulkCreate(buildRoles());
    roles = await Role.findAll({ raw: true });
    logger.info(`[BOOTSTRAP] 预置角色 ${roles.length} 个`);
  }

  // 3) 角色权限映射（含老库升级：角色已存在但映射缺失时补齐）
  const rpAfter = await RolePermission.count();
  if (rpAfter === 0) {
    const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));
    const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
    const map = buildRolePermissionMap(PERMS);
    const rows = [];
    for (const [roleCode, codes] of Object.entries(map)) {
      for (const code of codes) {
        if (permByCode[code] && roleByCode[roleCode]) {
          rows.push({ roleId: roleByCode[roleCode], permissionId: permByCode[code] });
        }
      }
    }
    if (rows.length) await RolePermission.bulkCreate(rows);
    invalidate();
    logger.info(`[BOOTSTRAP] 预置角色权限映射 ${rows.length} 条`);
    return { seeded: true };
  }

  invalidate();
  return { seeded: false };
}

// 预置默认币种基准汇率（无 USD→CNY 时）
async function seedBaseRate() {
  const today = new Date().toISOString().slice(0, 10);
  const exists = await ExchangeRate.findOne({
    where: { baseCurrency: 'USD', targetCurrency: 'CNY', rateDate: today },
  });
  if (exists) return false;
  await ExchangeRate.create({ baseCurrency: 'USD', targetCurrency: 'CNY', rate: 7.2, rateDate: today });
  logger.info('[BOOTSTRAP] 预置 USD→CNY 基准汇率 7.2');
  return true;
}

// 创建默认 admin（仅 ADMIN_INIT_PASSWORD 路径；创建后 mustChangePassword=true 首登强制改密）
async function createDefaultAdmin() {
  const adminRole = await Role.findOne({ where: { code: 'admin' } });
  const user = await User.create({
    username: 'admin',
    name: '系统管理员',
    role: 'admin',
    password: bcrypt.hashSync(config.adminInitPassword, 10),
    status: 'active',
    mustChangePassword: true,
  });
  if (adminRole) {
    const UserRole = require('../models/UserRole');
    await UserRole.create({ userId: user.id, roleId: adminRole.id });
  }
  invalidate(user.id);
  logger.info('[BOOTSTRAP] 已创建默认管理员 admin（ADMIN_INIT_PASSWORD 路径，首登须改密）');
  return user;
}

// 启动自检总入口
async function ensureBootstrap() {
  const result = await seedRbac();
  await seedBaseRate();

  const userCount = await User.count();
  if (userCount > 0) {
    return { needsSetup: false, hasAdmin: true, rbacSeeded: result.seeded };
  }
  if (config.adminInitPassword) {
    await createDefaultAdmin();
    return { needsSetup: false, hasAdmin: true, rbacSeeded: result.seeded };
  }
  logger.info('[BOOTSTRAP] 尚无用户：等待首次访问创建管理员（/setup-admin）');
  return { needsSetup: true, hasAdmin: false, rbacSeeded: result.seeded };
}

// 轻量状态查询（供 GET /api/system/init-status）
async function getInitStatus() {
  const userCount = await User.count();
  return {
    needsSetup: userCount === 0,
    hasAdmin: userCount > 0,
  };
}

module.exports = { ensureBootstrap, getInitStatus, seedRbac, seedBaseRate };
