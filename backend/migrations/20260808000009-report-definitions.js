'use strict';

// P3.3 自定义报表：ReportDefinition 表
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.showAllTables();
    if (exists.includes('ReportDefinitions')) return;
    await queryInterface.createTable('ReportDefinitions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      bizType: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'order' },
      groupBy: { type: Sequelize.STRING(50), allowNull: true },
      measures: { type: Sequelize.TEXT, allowNull: true },
      filters: { type: Sequelize.TEXT, allowNull: true },
      chartType: { type: Sequelize.STRING(20), defaultValue: 'table' },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('ReportDefinitions', ['bizType', 'enabled']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('ReportDefinitions');
  },
};
