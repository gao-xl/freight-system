'use strict';

// 系统运维通配权限点补充迁移
// 为已存在的数据库补齐 system:*（备份/恢复/健康检查/自动化等 admin 专属接口），
// 并映射到 admin 内置角色（与 seedData/rbac.js 保持一致）。
// 背景：备份/恢复接口（POST /api/system/backup、POST /api/system/restore 等）使用
// requirePermission('system', '*')，但旧库权限集缺少该通配权限点，导致 admin 也无法调用。
// 全程幂等：已存在的记录跳过，可安全重复执行。
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const perm = { module: 'system', action: '*', name: '系统运维（备份/恢复/健康检查/自动化）', code: 'system:*' };

    const existing = await queryInterface.sequelize.query(
      "SELECT code FROM \"Permissions\" WHERE code = :code",
      { replacements: { code: perm.code }, type: Sequelize.QueryTypes.SELECT }
    );

    let permId = null;
    if (existing.length) {
      const row = await queryInterface.sequelize.query(
        "SELECT id FROM \"Permissions\" WHERE code = :code",
        { replacements: { code: perm.code }, type: Sequelize.QueryTypes.SELECT }
      );
      permId = row[0].id;
    } else {
      const inserted = await queryInterface.bulkInsert('Permissions', [{ ...perm, createdAt: now, updatedAt: now }], { returning: true });
      permId = inserted && inserted[0] ? inserted[0].id : null;
      if (!permId) {
        const row = await queryInterface.sequelize.query(
          "SELECT id FROM \"Permissions\" WHERE code = :code",
          { replacements: { code: perm.code }, type: Sequelize.QueryTypes.SELECT }
        );
        permId = row[0].id;
      }
    }

    // 映射到 admin 角色
    const roles = await queryInterface.sequelize.query(
      "SELECT id FROM \"Roles\" WHERE code = 'admin'",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!roles.length || !permId) return;

    const existingLinks = await queryInterface.sequelize.query(
      "SELECT \"roleId\", \"permissionId\" FROM \"RolePermissions\" WHERE \"permissionId\" = :permId",
      { replacements: { permId }, type: Sequelize.QueryTypes.SELECT }
    );
    const linkKey = new Set(existingLinks.map((l) => `${l.roleId}:${l.permissionId}`));
    const linksToAdd = [];
    for (const role of roles) {
      if (!linkKey.has(`${role.id}:${permId}`)) {
        linksToAdd.push({ roleId: role.id, permissionId: permId, createdAt: now, updatedAt: now });
      }
    }
    if (linksToAdd.length) {
      await queryInterface.bulkInsert('RolePermissions', linksToAdd);
    }
  },

  async down(queryInterface, Sequelize) {
    const code = 'system:*';
    const perms = await queryInterface.sequelize.query(
      "SELECT id FROM \"Permissions\" WHERE code = :code",
      { replacements: { code }, type: Sequelize.QueryTypes.SELECT }
    );
    const ids = perms.map((p) => p.id);
    if (ids.length) {
      await queryInterface.sequelize.query(
        "DELETE FROM \"RolePermissions\" WHERE \"permissionId\" IN (:ids)",
        { replacements: { ids }, type: Sequelize.QueryTypes.DELETE }
      );
      await queryInterface.sequelize.query(
        "DELETE FROM \"Permissions\" WHERE id IN (:ids)",
        { replacements: { ids }, type: Sequelize.QueryTypes.DELETE }
      );
    }
  },
};