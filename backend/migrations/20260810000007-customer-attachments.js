'use strict';

/** P1 客户附件表 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='CustomerAttachments'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (exists.length > 0) return; // 幂等：seed(force sync) 已建表则跳过

    await queryInterface.createTable('CustomerAttachments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: { type: Sequelize.INTEGER, allowNull: false },
      category: { type: Sequelize.STRING(30), defaultValue: 'other' },
      title: { type: Sequelize.STRING(100) },
      filePath: { type: Sequelize.STRING(255), allowNull: false },
      originalName: { type: Sequelize.STRING(200) },
      mimeType: { type: Sequelize.STRING(100) },
      size: { type: Sequelize.INTEGER, defaultValue: 0 },
      remark: { type: Sequelize.STRING(255) },
      uploadedBy: { type: Sequelize.INTEGER },
      groupId: { type: Sequelize.INTEGER },
      ownerId: { type: Sequelize.INTEGER },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE },
    });
    await queryInterface.addIndex('CustomerAttachments', ['customerId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('CustomerAttachments');
  },
};