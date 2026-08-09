'use strict';

// 本地运价小库：FreightRates 表（P2.7）
// 字段与 src/models/FreightRate.js 一一对应，改模型必须同步改本迁移。
// PostgreSQL 执行：只用 createTable + addIndex，未使用方言专有语法。
// 幂等：本地开发常先跑过 sequelize.sync() 建好表，重复建表会直接报错（参照 0002 写法）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.showAllTables();
    const normalized = existing.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (normalized.includes('FreightRates')) return;

    await queryInterface.createTable('FreightRates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      route: { type: Sequelize.STRING(100) },        // 航线名，如"青岛-洛杉矶"
      originPort: { type: Sequelize.STRING(50) },    // 起运港
      destPort: { type: Sequelize.STRING(50) },      // 目的港
      carrier: { type: Sequelize.STRING(50) },       // 船司
      containerType: { type: Sequelize.STRING(10) }, // 箱型：20GP/40GP/40HQ
      rate: { type: Sequelize.DECIMAL(12, 2) },      // 运价
      currency: { type: Sequelize.STRING(10), defaultValue: 'CNY' },
      validFrom: { type: Sequelize.DATE },           // 有效期起（空=长期有效）
      validTo: { type: Sequelize.DATE },             // 有效期止（空=长期有效）
      remark: { type: Sequelize.STRING(255) },
      // 数据隔离：归属小组 / 归属操作员
      groupId: { type: Sequelize.INTEGER },
      ownerId: { type: Sequelize.INTEGER },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 检索热路径：起运港+目的港+箱型 组合索引
    try {
      await queryInterface.addIndex('FreightRates', ['originPort', 'destPort', 'containerType'], { name: 'freight_rates_route_lookup' });
    } catch {
      // 索引已存在（重复迁移），跳过
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('FreightRates');
  },
};
