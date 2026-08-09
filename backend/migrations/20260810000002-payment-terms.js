'use strict';

/** @type {import('sequelize-cli').Migration} */
// 幂等：seed(force sync) 已按模型建出新列时，跳过加列，避免与测试库/重复执行冲突
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'Customers';
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    if (!existing.has('paymentTerms')) {
      await queryInterface.addColumn(table, 'paymentTerms', {
        type: Sequelize.INTEGER,
        defaultValue: 30,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Customers', 'paymentTerms');
  },
};