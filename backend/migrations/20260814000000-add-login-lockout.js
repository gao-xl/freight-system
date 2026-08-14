// S3 登录锁定：User 表新增 loginFails（连续失败计数）与 lockedUntil（锁定截止时间）
// 幂等：字段已存在则跳过（空库/老库升级均可安全执行）
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('Users');
    if (!cols.loginFails) {
      await queryInterface.addColumn('Users', 'loginFails', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!cols.lockedUntil) {
      await queryInterface.addColumn('Users', 'lockedUntil', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('Users');
    if (cols.lockedUntil) {
      await queryInterface.removeColumn('Users', 'lockedUntil');
    }
    if (cols.loginFails) {
      await queryInterface.removeColumn('Users', 'loginFails');
    }
  },
};