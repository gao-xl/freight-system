'use strict';

/** P2-1 集成网关：外部调用方（入站回调渠道）注册表
 * IntegrationClients 与 IntegrationConfig 互补：
 * - IntegrationConfig：本系统要对接的远端系统
 * - IntegrationClient：对接本系统的外部第三方（入站回调 HMAC 签名密钥来源）
 * 幂等：表已存在（开发环境 sync 已建）则跳过，生产由本迁移保证表结构。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = async (name) => {
      const r = await queryInterface.sequelize.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='${name}'`,
        { type: Sequelize.QueryTypes.SELECT },
      );
      return r.length > 0;
    };

    if (!(await tableExists('IntegrationClients'))) {
      await queryInterface.createTable('IntegrationClients', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        code: { type: Sequelize.STRING(30), allowNull: false },
        name: { type: Sequelize.STRING(50), allowNull: false },
        apiKey: { type: Sequelize.STRING(512) },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        callCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lastCallAt: { type: Sequelize.DATE },
        config: { type: Sequelize.TEXT },
        remark: { type: Sequelize.TEXT },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('IntegrationClients', ['code'], { unique: true });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('IntegrationClients');
  },
};