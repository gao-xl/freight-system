'use strict';

// 账期（结账/扎帐/锁帐）迁移：新增 AccountingPeriods 表，并为财务流水增加结算归属月份字段
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AccountingPeriods', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      periodCode: { type: Sequelize.STRING(7), allowNull: false, unique: true },
      year: { type: Sequelize.INTEGER, allowNull: false },
      month: { type: Sequelize.INTEGER, allowNull: false },
      startDate: { type: Sequelize.DATEONLY },
      endDate: { type: Sequelize.DATEONLY },
      status: { type: Sequelize.STRING(20), defaultValue: 'open' },
      receivable: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      payable: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      received: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      paid: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      balance: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      profit: { type: Sequelize.DECIMAL(11, 2), defaultValue: 0 },
      closedBy: { type: Sequelize.INTEGER },
      closedAt: { type: Sequelize.DATE },
      closeNote: { type: Sequelize.TEXT },
      lockedBy: { type: Sequelize.INTEGER },
      lockedAt: { type: Sequelize.DATE },
      lockNote: { type: Sequelize.TEXT },
      unlockedBy: { type: Sequelize.INTEGER },
      unlockedAt: { type: Sequelize.DATE },
      unlockReason: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('AccountingPeriods', ['year', 'month']);

    // 为财务流水增加结算归属月份字段（幂等，避免与 settle-month 迁移重复冲突）
    const table = await queryInterface.describeTable('FinanceRecords');
    if (!table.settleMonth) {
      await queryInterface.addColumn('FinanceRecords', 'settleMonth', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    const indexes = await queryInterface.showIndex('FinanceRecords');
    if (!indexes.some((i) => i.name === 'finance_records_settle_month')) {
      await queryInterface.addIndex('FinanceRecords', ['settleMonth'], { name: 'finance_records_settle_month' });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('FinanceRecords', ['settleMonth']);
    await queryInterface.removeColumn('FinanceRecords', 'settleMonth');
    await queryInterface.dropTable('AccountingPeriods');
  },
};