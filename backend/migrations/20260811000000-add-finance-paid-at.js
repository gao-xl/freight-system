'use strict';

/** @type {import('sequelize-cli').Migration} */
// 修复：FinanceRecord 模型定义了 paidAt（核销/到账时间）字段，
// 但初始迁移(Frontier 20260807000000-initial)未建该列，导致预警规则扫描与财务核销报
// "column FinanceRecord.paidAt does not exist"。此处补列（幂等）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'FinanceRecords';
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    if (!existing.has('paidAt')) {
      await queryInterface.addColumn(table, 'paidAt', { type: Sequelize.DATE, allowNull: true });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('FinanceRecords', 'paidAt');
  },
};