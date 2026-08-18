'use strict';

/** P0 提单表（主单 MBL / 分单 HBL） */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='BillOfLadings'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (exists.length > 0) return;

    await queryInterface.createTable('BillOfLadings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      blNo: { type: Sequelize.STRING(50), allowNull: false },
      blType: { type: Sequelize.ENUM('master', 'house'), allowNull: false, defaultValue: 'house' },
      orderId: { type: Sequelize.INTEGER },
      carrierId: { type: Sequelize.INTEGER },
      masterBlId: { type: Sequelize.INTEGER },
      vessel: { type: Sequelize.STRING(100) },
      voyage: { type: Sequelize.STRING(50) },
      containerNo: { type: Sequelize.STRING(200) },
      packageCount: { type: Sequelize.INTEGER },
      grossWeight: { type: Sequelize.DECIMAL(12, 2) },
      volume: { type: Sequelize.DECIMAL(12, 2) },
      shipperName: { type: Sequelize.STRING(200) },
      shipperAddress: { type: Sequelize.STRING(500) },
      consigneeName: { type: Sequelize.STRING(200) },
      consigneeAddress: { type: Sequelize.STRING(500) },
      notifyParty: { type: Sequelize.STRING(500) },
      placeOfReceipt: { type: Sequelize.STRING(100) },
      portOfLoading: { type: Sequelize.STRING(100) },
      portOfDischarge: { type: Sequelize.STRING(100) },
      placeOfDelivery: { type: Sequelize.STRING(100) },
      freightClause: { type: Sequelize.STRING(50) },
      originalCount: { type: Sequelize.INTEGER, defaultValue: 3 },
      telexRelease: { type: Sequelize.BOOLEAN, defaultValue: false },
      issueDate: { type: Sequelize.DATEONLY },
      status: { type: Sequelize.ENUM('draft', 'issued', 'surrendered', 'voided'), defaultValue: 'draft' },
      remark: { type: Sequelize.TEXT },
      groupId: { type: Sequelize.INTEGER },
      ownerId: { type: Sequelize.INTEGER },
      version: { type: Sequelize.INTEGER, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE },
    });
    await queryInterface.addIndex('BillOfLadings', ['orderId']);
    await queryInterface.addIndex('BillOfLadings', ['blNo']);
    await queryInterface.addIndex('BillOfLadings', ['blType']);
    await queryInterface.addIndex('BillOfLadings', ['masterBlId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('BillOfLadings');
  },
};