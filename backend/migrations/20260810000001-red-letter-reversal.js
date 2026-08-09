'use strict';

/** @type {import('sequelize-cli').Migration} */
// 幂等：seed(force sync) 已按模型建出新列时，跳过加列，避免与测试库/重复执行冲突
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'FinanceRecords';
    // 查询当前已存在的列
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    const columns = [
      ['reverseRef', Sequelize.INTEGER, { allowNull: true }],
      ['reverseType', Sequelize.ENUM('full', 'partial'), { allowNull: true }],
      ['reversedAt', Sequelize.DATE, { allowNull: true }],
      ['reversedBy', Sequelize.INTEGER, { allowNull: true }],
      ['reversedReason', Sequelize.STRING(255), { allowNull: true }],
    ];

    for (const [name, type, opts] of columns) {
      if (!existing.has(name)) {
        await queryInterface.addColumn(table, name, { type, ...opts });
      }
    }

    // 索引幂等：已存在则跳过
    const idx = await queryInterface.sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
      { bind: [table, 'finance_records_reverse_ref'], type: Sequelize.QueryTypes.SELECT },
    );
    if (idx.length === 0) {
      await queryInterface.addIndex(table, ['reverseRef'], { name: 'finance_records_reverse_ref' });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('FinanceRecords', 'finance_records_reverse_ref');
    await queryInterface.removeColumn('FinanceRecords', 'reversedReason');
    await queryInterface.removeColumn('FinanceRecords', 'reversedBy');
    await queryInterface.removeColumn('FinanceRecords', 'reversedAt');
    await queryInterface.removeColumn('FinanceRecords', 'reverseType');
    await queryInterface.removeColumn('FinanceRecords', 'reverseRef');
  },
};