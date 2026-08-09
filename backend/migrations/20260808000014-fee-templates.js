'use strict';

// N1 费用模板表
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('FeeTemplates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      items: { type: Sequelize.TEXT, allowNull: false, defaultValue: '[]' },
      remark: { type: Sequelize.STRING(255), allowNull: true },
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
