'use strict';

/** @type {import('sequelize-cli').Migration} */
// 修复：Role 模型定义了 isSystem（系统内置角色不可删）字段，但初始迁移
// (20260807000000-initial) 建 Roles 表时漏掉该列，导致 bootstrap 预置角色时
// 报 "column Roles.isSystem does not exist"。此处补列（幂等）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'Roles';
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    if (!existing.has('isSystem')) {
      await queryInterface.addColumn(table, 'isSystem', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Roles', 'isSystem');
  },
};