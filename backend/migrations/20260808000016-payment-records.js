'use strict';

// N3 收款/付款单表
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PaymentRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(40), unique: true, allowNull: false },
      direction: { type: Sequelize.STRING(10), allowNull: false },
      customerId: { type: Sequelize.INTEGER, allowNull: true },
      supplierId: { type: Sequelize.INTEGER, allowNull: true },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'CNY' },
      paidAt: { type: Sequelize.DATEONLY, allowNull: true },
      appliedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      appliedAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      remark: { type: Sequelize.STRING(500), allowNull: true },
      groupId: { type: Sequelize.INTEGER, allowNull: true },
      ownerId: { type: Sequelize.INTEGER, allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
  },
  async down() {
    // 不提供回滚
  },
};
