'use strict';

// P3.1 业务规则引擎 DB 化：BusinessRule 表
// 生产升级：npm run db:migrate
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.showAllTables();
    if (exists.includes('BusinessRules')) return; // 幂等：已存在则跳过
    await queryInterface.createTable('BusinessRules', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      bizType: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'order' },
      ruleType: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'expr' },
      trigger: { type: Sequelize.STRING(50), defaultValue: 'cron' },
      condition: { type: Sequelize.TEXT, allowNull: true },
      params: { type: Sequelize.TEXT, allowNull: true },
      action: { type: Sequelize.TEXT, allowNull: true },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('BusinessRules', ['bizType']);
    await queryInterface.addIndex('BusinessRules', ['enabled']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('BusinessRules');
  },
};
