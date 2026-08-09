'use strict';

// E2 通知推送记录表（NotificationRecords）
// 生产升级：npm run db:migrate（启动自动迁移亦会执行；幂等：表已存在则跳过）
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.showAllTables();
    if (exists.includes('NotificationRecords')) return; // 幂等：已存在则跳过
    await queryInterface.createTable('NotificationRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      eventType: { type: Sequelize.STRING(50), allowNull: false },
      targetType: { type: Sequelize.STRING(50), defaultValue: 'alert' },
      targetId: { type: Sequelize.INTEGER },
      channel: { type: Sequelize.STRING(30), allowNull: false },
      status: { type: Sequelize.ENUM('sent', 'failed'), defaultValue: 'sent' },
      error: { type: Sequelize.STRING(500) },
      payload: { type: Sequelize.TEXT },
      sentAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('NotificationRecords', ['eventType']);
    await queryInterface.addIndex('NotificationRecords', ['channel']);
    await queryInterface.addIndex('NotificationRecords', ['status']);
    await queryInterface.addIndex('NotificationRecords', ['targetType', 'targetId']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('NotificationRecords');
  },
};
