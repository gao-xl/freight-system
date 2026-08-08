'use strict';

// P3.2 流程状态机配置化：WorkflowConfig 表
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.showAllTables();
    if (exists.includes('WorkflowConfigs')) return;
    await queryInterface.createTable('WorkflowConfigs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bizType: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'order' },
      fromStatus: { type: Sequelize.STRING(40), allowNull: false },
      toStatus: { type: Sequelize.STRING(40), allowNull: false },
      action: { type: Sequelize.STRING(50), defaultValue: 'update_status' },
      fromRole: { type: Sequelize.STRING(50), allowNull: true },
      auto: { type: Sequelize.BOOLEAN, defaultValue: false },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('WorkflowConfigs', ['bizType', 'enabled']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('WorkflowConfigs');
  },
};
