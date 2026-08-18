'use strict';

/** P0 套打配置：PrintTemplates 增加 overlayMode/offsetX/offsetY/scale/paperSize */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='PrintTemplates' AND column_name='overlayMode'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (cols.length > 0) return;

    await queryInterface.addColumn('PrintTemplates', 'overlayMode', { type: Sequelize.BOOLEAN, defaultValue: false });
    await queryInterface.addColumn('PrintTemplates', 'offsetX', { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await queryInterface.addColumn('PrintTemplates', 'offsetY', { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 });
    await queryInterface.addColumn('PrintTemplates', 'scale', { type: Sequelize.DECIMAL(4, 2), defaultValue: 1.0 });
    await queryInterface.addColumn('PrintTemplates', 'paperSize', { type: Sequelize.STRING(20) });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('PrintTemplates', 'overlayMode');
    await queryInterface.removeColumn('PrintTemplates', 'offsetX');
    await queryInterface.removeColumn('PrintTemplates', 'offsetY');
    await queryInterface.removeColumn('PrintTemplates', 'scale');
    await queryInterface.removeColumn('PrintTemplates', 'paperSize');
  },
};