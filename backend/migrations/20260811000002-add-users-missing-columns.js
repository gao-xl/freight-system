'use strict';

/** @type {import('sequelize-cli').Migration} */
// 修复：User 模型定义了 lastLoginAt / groupId / customerId 三个字段，
// 但初始迁移(20260807000000-initial)及后续迁移均未为用户表创建这些列，
// 导致 setup-admin 创建管理员时报 "column Users.lastLoginAt does not exist"。
// 此处补列（幂等）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'Users';
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    const columns = [
      ['lastLoginAt', Sequelize.DATE, { allowNull: true }],
      ['groupId', Sequelize.INTEGER, { allowNull: true }],
      ['customerId', Sequelize.INTEGER, { allowNull: true }],
    ];

    for (const [name, type, opts] of columns) {
      if (!existing.has(name)) {
        await queryInterface.addColumn(table, name, { type, ...opts });
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Users', 'customerId');
    await queryInterface.removeColumn('Users', 'groupId');
    await queryInterface.removeColumn('Users', 'lastLoginAt');
  },
};