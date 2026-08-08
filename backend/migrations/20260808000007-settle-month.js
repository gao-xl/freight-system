'use strict';

// 账期功能补列：FinanceRecords.settleMonth（结算归属月份）
// 模型已定义字段与索引但缺迁移，导致干净库启动失败（schema 漂移）
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('FinanceRecords');
    if (!table.settleMonth) {
      await queryInterface.addColumn('FinanceRecords', 'settleMonth', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    const indexes = await queryInterface.showIndex('FinanceRecords');
    if (!indexes.some((i) => i.name === 'finance_records_settle_month')) {
      await queryInterface.addIndex('FinanceRecords', ['settleMonth']);
    }
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('FinanceRecords', 'finance_records_settle_month').catch(() => {});
    await queryInterface.removeColumn('FinanceRecords', 'settleMonth').catch(() => {});
  },
};
