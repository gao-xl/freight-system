'use strict';

// P1 发票号段权限点补充：新增 system:finance 权限点，映射到 admin / manager / finance 角色。
// 全程幂等，可安全重复执行。
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const perm = { module: 'system', action: 'finance', name: '发票号段管理', code: 'system:finance' };

    const existing = await queryInterface.sequelize.query(
      "SELECT code FROM \"Permissions\" WHERE code = :code",
      { replacements: { code: perm.code }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('Permissions', [{ ...perm, createdAt: now, updatedAt: now }]);
    }

    const roles = await queryInterface.sequelize.query(
      "SELECT id, code FROM \"Roles\" WHERE code IN ('admin', 'manager', 'finance')",
      { type: Sequelize.QueryTypes.SELECT }
    );
    const roleByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));
    const permRow = await queryInterface.sequelize.query(
      "SELECT id FROM \"Permissions\" WHERE code = :code",
      { replacements: { code: perm.code }, type: Sequelize.QueryTypes.SELECT }
    );
    if (!permRow.length) return;
    const permId = permRow[0].id;

    const existingLinks = await queryInterface.sequelize.query(
      "SELECT \"roleId\", \"permissionId\" FROM \"RolePermissions\" WHERE \"permissionId\" = :permId",
      { replacements: { permId }, type: Sequelize.QueryTypes.SELECT }
    );
    const linkedRoleIds = new Set(existingLinks.map((l) => l.roleId));
    const linksToAdd = [];
    for (const roleCode of ['admin', 'manager', 'finance']) {
      const roleId = roleByCode[roleCode];
      if (!roleId || linkedRoleIds.has(roleId)) continue;
      linksToAdd.push({ roleId, permissionId: permId, createdAt: now, updatedAt: now });
    }
    if (linksToAdd.length) {
      await queryInterface.bulkInsert('RolePermissions', linksToAdd);
    }
  },

  async down(queryInterface, Sequelize) {
    const perm = await queryInterface.sequelize.query(
      "SELECT id FROM \"Permissions\" WHERE code = 'system:finance'",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (perm.length) {
      const id = perm[0].id;
      await queryInterface.sequelize.query(
        "DELETE FROM \"RolePermissions\" WHERE \"permissionId\" = :id",
        { replacements: { id }, type: Sequelize.QueryTypes.DELETE }
      );
      await queryInterface.sequelize.query(
        "DELETE FROM \"Permissions\" WHERE id = :id",
        { replacements: { id }, type: Sequelize.QueryTypes.DELETE }
      );
    }
  },
};