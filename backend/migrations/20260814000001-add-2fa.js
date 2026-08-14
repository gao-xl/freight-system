// S4 二次认证(2FA)：User 表新增 twoFactor* 字段，CompanyProfile 新增安全设置开关与 SMTP 配置
// 幂等：字段已存在则跳过（空库/老库升级均可安全执行）
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const userCols = await queryInterface.describeTable('Users');
    const userAdds = [
      ['twoFactorEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['totpSecretEnc', { type: Sequelize.STRING(255), allowNull: true }],
      ['totpVerifiedAt', { type: Sequelize.DATE, allowNull: true }],
      ['backupCodesEnc', { type: Sequelize.TEXT, allowNull: true }],
    ];
    for (const [name, def] of userAdds) {
      if (!userCols[name]) await queryInterface.addColumn('Users', name, def);
    }
    if (!userCols.twoFactorType) {
      await queryInterface.addColumn('Users', 'twoFactorType', {
        type: Sequelize.ENUM('totp', 'email'),
        allowNull: true,
      });
    }

    const profileCols = await queryInterface.describeTable('CompanyProfiles');
    const profileAdds = [
      ['security2faEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['securityEmailEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['securityTotpEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['smtpHost', { type: Sequelize.STRING(100), allowNull: true }],
      ['smtpPort', { type: Sequelize.INTEGER, allowNull: true }],
      ['smtpUser', { type: Sequelize.STRING(100), allowNull: true }],
      ['smtpPassEnc', { type: Sequelize.STRING(255), allowNull: true }],
      ['smtpFrom', { type: Sequelize.STRING(120), allowNull: true }],
    ];
    for (const [name, def] of profileAdds) {
      if (!profileCols[name]) await queryInterface.addColumn('CompanyProfiles', name, def);
    }
  },
  async down(queryInterface) {
    const userCols = await queryInterface.describeTable('Users');
    const userRems = ['backupCodesEnc', 'totpVerifiedAt', 'totpSecretEnc', 'twoFactorType', 'twoFactorEnabled'];
    for (const name of userRems) {
      if (userCols[name]) await queryInterface.removeColumn('Users', name);
    }
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_twoFactorType"');

    const profileCols = await queryInterface.describeTable('CompanyProfiles');
    const profileRems = ['smtpFrom', 'smtpPassEnc', 'smtpUser', 'smtpPort', 'smtpHost', 'securityTotpEnabled', 'securityEmailEnabled', 'security2faEnabled'];
    for (const name of profileRems) {
      if (profileCols[name]) await queryInterface.removeColumn('CompanyProfiles', name);
    }
  },
};