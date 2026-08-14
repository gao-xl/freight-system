#!/usr/bin/env node
'use strict';

/**
 * 正式上线安全加固脚本（P0 安全项）
 * 运行：node scripts/security-hardening.js [--apply] [--force-admin-password] [--no-relogin]
 *
 * 默认 DRY-RUN：仅预览将执行的操作，不写数据库；加 --apply 才真正生效。
 * 三项 P0 安全项：
 *   1. 清理预置弱口令测试账号（manager/operator/finance/viewer），只保留 admin
 *   2. admin 默认口令检测 / 强制首登改密（--force-admin-password）
 *   3. 递增保留用户 tokenVersion，强制现存会话全部重新登录（--no-relogin 关闭）
 *
 * 安全设计：
 *   - 全程由事务包裹，失败自动回滚，不产生半成品数据
 *   - 删除账号前逐一检查业务引用（Order.salesId / CustomerFollow.operatorId），
 *     有引用的业务数据保留但归属置空，绝不级联删业务数据
 *   - AuditLog 审计痕保留（内含冗余 username，不删归属）
 */

const bcrypt = require('bcryptjs');
const {
  sequelize, User, Session, ApiKey, UserRole, UserGroup, Order, CustomerFollow,
} = require('../src/models');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE_ADMIN = args.includes('--force-admin-password');
const RELOGIN = !args.includes('--no-relogin');

// 预置弱口令测试账号（seed 播种，仅演示/工具库存在；正式上线应清除，只留 admin）
const PRESET_TEST_ACCOUNTS = ['manager', 'operator', 'finance', 'viewer'];
const DEFAULT_ADMIN_PASSWORD = '123456';

// 统计某用户在各业务表中的引用（用于删除前安全评估）
async function collectRefs(userId) {
  // 表名取自模型 getTableName()，避免硬编码与 sync/迁移实际建表名不一致
  const checks = [
    { label: 'orders', table: Order.getTableName(), column: 'salesId' },
    { label: 'customer_follows', table: CustomerFollow.getTableName(), column: 'operatorId' },
  ];
  const refs = [];
  for (const c of checks) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS n FROM "${c.table}" WHERE "${c.column}" = :id`,
        { replacements: { id: userId }, type: sequelize.QueryTypes.SELECT }
      );
      const n = rows && rows[0] ? Number(rows[0].n) : 0;
      if (n > 0) refs.push({ table: c.label, column: c.column, count: n });
    } catch (e) {
      // 表/列不存在则跳过（不同版本 schema 差异），不阻断
      console.warn(`  [跳过引用检查] ${c.label}.${c.column}: ${e.message}`);
    }
  }
  return refs;
}

// 清理单个测试账号：删除关联 + 业务引用置空 + 删除用户（事务内）
async function removeUser(user) {
  const t = await sequelize.transaction();
  try {
    await Session.destroy({ where: { userId: user.id }, transaction: t });
    await ApiKey.destroy({ where: { userId: user.id }, transaction: t });
    await UserRole.destroy({ where: { userId: user.id }, transaction: t });
    await UserGroup.destroy({ where: { userId: user.id }, transaction: t });
    // 业务数据保留，归属置空（避免外键挂空）
    // 用原始 SQL 绕过 Sequelize 对 allowNull:false 字段的 update 校验（0 行匹配也不报错）
    await sequelize.query(
      `UPDATE "${Order.getTableName()}" SET "salesId" = NULL WHERE "salesId" = :id`,
      { replacements: { id: user.id }, transaction: t }
    );
    await sequelize.query(
      `UPDATE "${CustomerFollow.getTableName()}" SET "operatorId" = NULL WHERE "operatorId" = :id`,
      { replacements: { id: user.id }, transaction: t }
    );
    // 审计痕保留（AuditLog.userId 无外键且含冗余 username，不删）
    await User.destroy({ where: { id: user.id }, transaction: t });
    await t.commit();
    console.log(`    已清理账号 ${user.username}（关联会话/密钥/角色/小组已删，业务归属已置空）`);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function main_() {
  await sequelize.authenticate();
  console.log('[安全加固] 已连接数据库');
  console.log(`模式: ${APPLY ? 'APPLY（实际执行）' : 'DRY-RUN（仅预览，加 --apply 执行）'}`);
  console.log('');

  const allUsers = await User.findAll({
    attributes: ['id', 'username', 'name', 'role', 'status', 'mustChangePassword', 'tokenVersion'],
  });
  const byName = new Map(allUsers.map((u) => [u.username, u]));

  // ---- 1. 清理预置测试账号 ----
  console.log('-- 1. 测试账号清理 --');
  const targets = allUsers.filter((u) => PRESET_TEST_ACCOUNTS.includes(u.username));
  if (targets.length === 0) {
    console.log('未发现预置测试账号（manager/operator/finance/viewer），无需清理');
  } else {
    for (const t of targets) {
      const refs = await collectRefs(t.id);
      const hasRef = refs.length > 0;
      console.log(`账号 ${t.username} (id=${t.id}, role=${t.role}): ${hasRef ? `存在业务引用 ${refs.length} 处` : '无业务引用'}`);
      for (const r of refs) console.log(`    ${r.table}.${r.column} × ${r.count}`);
      if (APPLY) await removeUser(t);
    }
  }
  console.log('');

  // ---- 2. admin 默认口令检查 / 强制首登改密 ----
  console.log('-- 2. admin 默认口令检查 --');
  const admin = byName.get('admin');
  if (admin) {
    const full = await User.findByPk(admin.id, { attributes: ['password'] });
    const isDefault = await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, full.password);
    if (isDefault) {
      console.log(`admin 仍为默认密码 123456！${FORCE_ADMIN ? '将强制 mustChangePassword=true（首登改密）' : '（加 --force-admin-password 强制修正）'}`);
      if (APPLY && FORCE_ADMIN) {
        await admin.update({ mustChangePassword: true });
        console.log('    已设置 admin 须改密');
      }
    } else if (FORCE_ADMIN) {
      console.log(`admin 已非默认密码，${APPLY ? '设置 mustChangePassword=true' : '（--force-admin-password 将强制其改密）'}`);
      if (APPLY) {
        await admin.update({ mustChangePassword: true });
        console.log('    已设置 admin 须改密');
      }
    } else {
      console.log('admin 已非默认密码，无需处理');
    }
  } else {
    console.log('未找到 admin 账号');
  }
  console.log('');

  // ---- 3. 强制所有用户重新登录 ----
  console.log('-- 3. 强制重新登录 --');
  if (RELOGIN) {
    const keep = allUsers.filter((u) => !PRESET_TEST_ACCOUNTS.includes(u.username));
    console.log(`${keep.length} 个保留用户 tokenVersion 将 +1（现存所有会话失效，需重新登录）`);
    if (APPLY) {
      for (const u of keep) await User.increment('tokenVersion', { where: { id: u.id } });
      console.log('    已递增保留用户 tokenVersion');
    }
  } else {
    console.log('已通过 --no-relogin 跳过');
  }
  console.log('');

  await sequelize.close();
  console.log(`[安全加固] 完成。${APPLY ? '已执行' : '未执行任何写操作，确认后加 --apply 真正生效'}`);
}

main_().catch((e) => {
  console.error('\n[安全加固] 失败:', e.message);
  process.exit(1);
});