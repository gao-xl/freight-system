'use strict';

// 账期（结账/扎帐/锁帐）权限点补充迁移
// 为已存在的数据库补齐 finance:close / finance:lock / finance:unlock 权限点，
// 并映射到 admin / manager / finance 三种内置角色（与 seed.js 保持一致）。
// 全程幂等：已存在的记录跳过，可安全重复执行。
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const permsToAdd = [
      { module: 'finance', action: 'close', name: '结账/扎帐财务', code: 'finance:close' },
      { module: 'finance', action: 'lock', name: '锁帐财务', code: 'finance:lock' },
      { module: 'finance', action: 'unlock', name: '解锁财务', code: 'finance:unlock' },
    ];

    const existing = await queryInterface.sequelize.query(
      "SELECT code FROM `Permissions` WHERE code IN (:codes)",
      { replacements: { codes: permsToAdd.map((p) => p.code) }, type: Sequelize.QueryTypes.SELECT }
    );
    const existingCodes = new Set(existing.map((r) => r.code));

    const toInsert = permsToAdd
      .filter((p) => !existingCodes.has(p.code))
      .map((p) => ({ ...p, createdAt: now, updatedAt: now }));

    if (toInsert.length) {
      await queryInterface.bulkInsert('Permissions', toInsert);
    }

    // 为内置角色映射上新权限
    const roles = await queryInterface.sequelize.query(
      "SELECT id, code FROM `Roles` WHERE code IN ('admin', 'manager', 'finance')",
      { type: Sequelize.QueryTypes.SELECT }
    );
    const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));

    const allPerms = await queryInterface.sequelize.query(
      "SELECT id, code FROM `Permissions` WHERE code IN (:codes)",
      { replacements: { codes: permsToAdd.map((p) => p.code) }, type: Sequelize.QueryTypes.SELECT }
    );

    const existingLinks = await queryInterface.sequelize.query(
      "SELECT roleId, permissionId FROM `RolePermissions`",
      { type: Sequelize.QueryTypes.SELECT }
    );
    const linkKey = new Set(existingLinks.map((l) => `${l.roleId}:${l.permissionId}`));

    const linksToAdd = [];
    for (const p of allPerms) {
      const permId = p.id;
      for (const roleCode of ['admin', 'manager', 'finance']) {
        const roleId = roleByCode[roleCode];
        if (!roleId) continue;
        if (!linkKey.has(`${roleId}:${permId}`)) {
          linksToAdd.push({ roleId, permissionId: permId, createdAt: now, updatedAt: now });
        }
      }
    }
    if (linksToAdd.length) {
      await queryInterface.bulkInsert('RolePermissions', linksToAdd);
    }
  },

  async down(queryInterface, Sequelize) {
    const codes = ['finance:close', 'finance:lock', 'finance:unlock'];
    const perms = await queryInterface.sequelize.query(
      "SELECT id FROM `Permissions` WHERE code IN (:codes)",
      { replacements: { codes }, type: Sequelize.QueryTypes.SELECT }
    );
    const ids = perms.map((p) => p.id);
    if (ids.length) {
      await queryInterface.sequelize.query(
        "DELETE FROM `RolePermissions` WHERE permissionId IN (:ids)",
        { replacements: { ids }, type: Sequelize.QueryTypes.DELETE }
      );
      await queryInterface.sequelize.query(
        "DELETE FROM `Permissions` WHERE id IN (:ids)",
        { replacements: { ids }, type: Sequelize.QueryTypes.DELETE }
      );
    }
  },
};