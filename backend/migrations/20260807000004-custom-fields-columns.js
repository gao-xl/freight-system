'use strict';

// P1.2 自定义字段补充迁移：为业务表追加 customFields JSON 列。
// 背景：P1.2 只改了 Sequelize 模型定义（DataTypes.JSON），漏写了迁移；
// sequelize.sync() 不会给已存在表加列 → 开发库/生产升级都会 schema 漂移
//（冒烟测试用 seed 的 sync({force:true}) 重建掩盖了此问题）。
// 本迁移只追加列不重建表；PostgreSQL 兼容；幂等：describeTable 检查列已存在则跳过。
// 与 src/models/{Booking,Customer,FinanceRecord,Order}.js 的 customFields 字段一一对应。
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = ['Bookings', 'Customers', 'FinanceRecords', 'Orders'];
    for (const table of tables) {
      let cols = {};
      try {
        cols = await queryInterface.describeTable(table);
      } catch {
        // 表尚未创建（正常迁移链中 initial 会先建表），跳过
        continue;
      }
      if (!cols.customFields) {
        await queryInterface.addColumn(table, 'customFields', {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '自定义字段值（P1.2）',
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = ['Bookings', 'Customers', 'FinanceRecords', 'Orders'];
    for (const table of tables) {
      let cols = {};
      try {
        cols = await queryInterface.describeTable(table);
      } catch {
        continue;
      }
      if (cols.customFields) await queryInterface.removeColumn(table, 'customFields');
    }
  },
};
