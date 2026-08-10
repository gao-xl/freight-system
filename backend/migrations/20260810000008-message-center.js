'use strict';

// F6 统一消息中心：新增 MessageRecords 表（站内消息，按用户归属）
// 幂等：表已存在（sync 已建）时启动自动迁移会跳过；回滚删除表及 ENUM 类型。
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MessageRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      type: { type: Sequelize.STRING(30), defaultValue: 'system' },
      level: { type: Sequelize.ENUM('info', 'warning', 'danger'), defaultValue: 'info' },
      title: { type: Sequelize.STRING(120) },
      content: { type: Sequelize.TEXT },
      refType: { type: Sequelize.STRING(30) },
      refId: { type: Sequelize.INTEGER },
      isRead: { type: Sequelize.BOOLEAN, defaultValue: false },
      readAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('MessageRecords', ['userId', 'isRead'], { name: 'message_records_user_read' });
    await queryInterface.addIndex('MessageRecords', ['userId', 'createdAt'], { name: 'message_records_user_created' });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MessageRecords');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_MessageRecords_level"');
  }
};
