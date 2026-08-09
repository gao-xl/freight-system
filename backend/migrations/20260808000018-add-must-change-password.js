// Onboarding：User 表新增 mustChangePassword 列（默认账号首登强制改密）
// 幂等：已存在则跳过（空库/老库升级均可安全执行）
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('Users');
    if (!cols.mustChangePassword) {
      await queryInterface.addColumn('Users', 'mustChangePassword', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('Users');
    if (cols.mustChangePassword) {
      await queryInterface.removeColumn('Users', 'mustChangePassword');
    }
  },
};
