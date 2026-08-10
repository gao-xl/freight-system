'use strict';

/** P1 发票号段表 + 默认应收/应付号段 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='NumberSegments'`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (exists.length === 0) {
      await queryInterface.createTable('NumberSegments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        bizType: { type: Sequelize.STRING(30), allowNull: false },
        prefix: { type: Sequelize.STRING(30), allowNull: false },
        currentSeq: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        startSeq: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 1 },
        endSeq: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        digit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        remark: { type: Sequelize.STRING(255) },
        groupId: { type: Sequelize.INTEGER },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('NumberSegments', ['bizType']);
      await queryInterface.addIndex('NumberSegments', ['bizType', 'prefix'], { unique: true });
    }

    // 幂等：写入默认应收/应付号段（已存在则跳过）
    const existing = await queryInterface.sequelize.query(
      `SELECT "bizType" FROM "NumberSegments" WHERE "bizType" IN ('invoice_ar','invoice_ap')`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    const have = new Set(existing.map((r) => r.bizType));
    const now = new Date();
    const defaults = [];
    if (!have.has('invoice_ar')) defaults.push({ bizType: 'invoice_ar', prefix: 'AR', currentSeq: 0, startSeq: 1, endSeq: 0, digit: 8, enabled: true, remark: '应收发票号段', createdAt: now, updatedAt: now });
    if (!have.has('invoice_ap')) defaults.push({ bizType: 'invoice_ap', prefix: 'AP', currentSeq: 0, startSeq: 1, endSeq: 0, digit: 8, enabled: true, remark: '应付发票号段', createdAt: now, updatedAt: now });
    if (defaults.length) {
      await queryInterface.bulkInsert('NumberSegments', defaults, {});
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('NumberSegments');
  },
};