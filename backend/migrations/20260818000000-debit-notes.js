'use strict';

/** P0 借记通知单表 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='DebitNotes'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (exists.length > 0) return;

    await queryInterface.createTable('DebitNotes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      debitNoteNo: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      supplierId: { type: Sequelize.INTEGER },
      orderId: { type: Sequelize.INTEGER },
      blId: { type: Sequelize.INTEGER },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      taxRate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      taxAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      totalAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      items: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('draft', 'issued', 'paid', 'cancelled'), defaultValue: 'draft' },
      issuedAt: { type: Sequelize.DATE },
      remark: { type: Sequelize.TEXT },
      createdBy: { type: Sequelize.INTEGER },
      groupId: { type: Sequelize.INTEGER },
      ownerId: { type: Sequelize.INTEGER },
      version: { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE },
    });
    await queryInterface.addIndex('DebitNotes', ['orderId']);
    await queryInterface.addIndex('DebitNotes', ['supplierId']);
    await queryInterface.addIndex('DebitNotes', ['blId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('DebitNotes');
  },
};