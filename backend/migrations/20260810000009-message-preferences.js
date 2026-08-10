'use strict';

// F6 消息订阅偏好：新增 MessagePreferences 表（用户 × 分类，唯一约束）
module.exports = {
  up(queryInterface, Sequelize) {
    return queryInterface.createTable('MessagePreferences', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      type: { type: Sequelize.STRING(30), allowNull: false },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    }).then(function () {
      return queryInterface.addIndex('MessagePreferences', ['userId', 'type'], { name: 'message_pref_user_type', unique: true });
    });
  },
  down(queryInterface) {
    return queryInterface.dropTable('MessagePreferences');
  }
};