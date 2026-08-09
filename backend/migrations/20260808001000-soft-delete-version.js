'use strict';

// P3.7 残余质量：核心模型软删除(deletedAt) + 乐观锁(version)
// 覆盖表：orders/bookings/customs_declarations/finance_records/customers/suppliers/quotations/documents/invoices/payment_transactions
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = [
      'Orders', 'Bookings', 'CustomsDeclarations', 'FinanceRecords',
      'Customers', 'Suppliers', 'Quotations', 'Documents', 'Invoices', 'PaymentTransactions',
    ];
    for (const t of tables) {
      try {
        const table = await queryInterface.describeTable(t);
        if (!table.deletedAt) {
          await queryInterface.addColumn(t, 'deletedAt', { type: Sequelize.DATE, allowNull: true });
        }
        if (!table.version) {
          await queryInterface.addColumn(t, 'version', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
        }
      } catch (e) {
        // 表不存在则跳过（幂等）
      }
    }
  },
  async down() {
    // 不提供回滚（列删除有数据风险），如需回滚请手动处理
  },
};
