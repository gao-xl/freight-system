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

// 预置 RBAC（权限点/角色/映射，三者都空才整体预置，避免半初始化状态）
async function seedRbac() {
  const [permCount, roleCount, rpCount] = await Promise.all([
    Permission.count(),
    Role.count(),
    RolePermission.count(),
  ]);
  if (permCount > 0 || roleCount > 0 || rpCount > 0) {
    // 已有数据但缺角色权限映射时仍补齐（老库升级场景：角色权限映射缺失会导致所有非 admin 无权限）
    if (roleCount > 0 && rpCount === 0) {
      const perms = await Permission.findAll({ raw: true });
      const roles = await Role.findAll({ raw: true });
      const map = buildRolePermissionMap(perms);
      const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));
      const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
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
      logger.info(`[BOOTSTRAP] 补齐角色权限映射 ${rows.length} 条（老库升级）`);
    }
    return { seeded: false };
  }
  const PERMS = buildPermissions();
  const permissionRecords = await Permission.bulkCreate(PERMS);
  const roleRecords = await Role.bulkCreate(buildRoles());
  const map = buildRolePermissionMap(PERMS);
  const permByCode = Object.fromEntries(permissionRecords.map((p) => [p.code, p.id]));
  const roleByCode = Object.fromEntries(roleRecords.map((r) => [r.code, r.id]));
  const rows = [];
  for (const [roleCode, codes] of Object.entries(map)) {
    for (const code of codes) {
      rows.push({ roleId: roleByCode[roleCode], permissionId: permByCode[code] });
    }
  }
  await RolePermission.bulkCreate(rows);
  invalidate();
  logger.info(`[BOOTSTRAP] 预置权限点 ${PERMS.length} 个 / 角色 ${roleRecords.length} 个 / 映射 ${rows.length} 条`);
  return { seeded: true };
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
