'use strict';

// P2.4 财务本币折算：为 FinanceRecords 追加 exchangeRate（本币折算汇率）与 localAmount（本币折算金额）
// 只追加列不重建表；SQLite/PostgreSQL 兼容；幂等：describeTable 检查列已存在则跳过。
// 与 src/models/FinanceRecord.js 字段一一对应，改模型必须同步改本迁移。
module.exports = {
  async up(queryInterface, Sequelize) {
    let cols = {};
    try {
      cols = await queryInterface.describeTable('FinanceRecords');
    } catch {
      // 表尚未创建（正常迁移链中 initial 会先建表），跳过
      return;
    }

    if (!cols.exchangeRate) {
      await queryInterface.addColumn('FinanceRecords', 'exchangeRate', {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: '本币折算汇率',
      });
    }
    if (!cols.localAmount) {
      await queryInterface.addColumn('FinanceRecords', 'localAmount', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: '本币折算金额',
      });
    }
  },

  async down(queryInterface) {
    let cols = {};
    try {
      cols = await queryInterface.describeTable('FinanceRecords');
    } catch {
      return;
    }
    if (cols.exchangeRate) await queryInterface.removeColumn('FinanceRecords', 'exchangeRate');
    if (cols.localAmount) await queryInterface.removeColumn('FinanceRecords', 'localAmount');
  },
};
