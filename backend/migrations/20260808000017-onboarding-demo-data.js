'use strict';

// Onboarding 示例数据基础设施（Spec v2.1 §6 + 设计细化 §3）
// 1. DemoDataLogs 批次表：记录示例数据生成批次，清空按批次追踪（isCleared 保留审计）
// 2. 9 张业务表补 isDemo 列（Customers/Suppliers/Quotations/QuotationItems/Orders/Bookings/
//    CustomsDeclarations/FinanceRecords/FreightRates）——演示数据标记，支持按标记一键清空
// 3. CompanyProfiles 补 defaultCurrency 列（默认币种，向导第 3 步数据源，默认 CNY）
// 全程幂等（showAllTables/describeTable 检查），PostgreSQL 执行。
// 注意：Quotations/QuotationItems/CompanyProfiles 由 sequelize.sync 创建，空库迁移时可能尚不存在，
//       用 try/catch 跳过（模型已带新列，sync 阶段会自动补齐）；不提供回滚。

const DEMO_TABLES = [
  'Customers',
  'Suppliers',
  'Quotations',
  'QuotationItems',
  'Orders',
  'Bookings',
  'CustomsDeclarations',
  'FinanceRecords',
  'FreightRates',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- 1. DemoDataLogs 批次表 ----
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (!normalized.includes('DemoDataLogs')) {
      await queryInterface.createTable('DemoDataLogs', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        batchId: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        isCleared: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }

    // ---- 2. 9 张业务表补 isDemo 列（表不存在则跳过，sync 阶段由模型补齐） ----
    for (const tableName of DEMO_TABLES) {
      try {
        const cols = await queryInterface.describeTable(tableName);
        if (!cols.isDemo) {
          await queryInterface.addColumn(tableName, 'isDemo', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          });
        }
      } catch (e) {
        // 表不存在（空库迁移时 sync 尚未创建）则跳过，不阻塞迁移链
        const msg = (e && (e.message || '')) || '';
        if (!/no such table|no description found|does not exist/i.test(msg)) throw e;
      }
    }

    // ---- 3. CompanyProfiles 补 defaultCurrency ----
    try {
      const companyCols = await queryInterface.describeTable('CompanyProfiles');
      if (!companyCols.defaultCurrency) {
        await queryInterface.addColumn('CompanyProfiles', 'defaultCurrency', {
          type: Sequelize.STRING(10),
          allowNull: false,
          defaultValue: 'CNY',
        });
      }
    } catch (e) {
      const msg = (e && (e.message || '')) || '';
      if (!/no such table|no description found|does not exist/i.test(msg)) {
        // CompanyProfiles 由 sync 创建，模型已带 defaultCurrency，跳过即可
        throw e;
      }
    }
  },
  async down() {
    // 不提供回滚（删列有数据风险）
  },
};
