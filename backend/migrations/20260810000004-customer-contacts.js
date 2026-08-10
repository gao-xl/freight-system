'use strict';

/** P1 客户多联系人表 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='Contacts'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (exists.length > 0) return; // 幂等：seed(force sync) 已建表则跳过

    await queryInterface.createTable('Contacts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(50), allowNull: false },
      position: { type: Sequelize.STRING(50) },
      department: { type: Sequelize.STRING(50) },
      phone: { type: Sequelize.STRING(30) },
      mobile: { type: Sequelize.STRING(30) },
      email: { type: Sequelize.STRING(100) },
      wechat: { type: Sequelize.STRING(50) },
      isPrimary: { type: Sequelize.BOOLEAN, defaultValue: false },
      language: { type: Sequelize.STRING(20), defaultValue: 'cn' },
      remark: { type: Sequelize.STRING(255) },
      groupId: { type: Sequelize.INTEGER },
      ownerId: { type: Sequelize.INTEGER },
      isDemo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE },
    });
    await queryInterface.addIndex('Contacts', ['customerId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Contacts');
  },
};