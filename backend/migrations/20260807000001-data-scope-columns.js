'use strict';

// 数据隔离迁移：为业务表补充 groupId / ownerId 归属列
// 用于生产环境（PostgreSQL）的规范迁移路径；本地开发可用 sequelize.sync() 快速建表。
// 说明：订单表 Orders 已在前置迁移/开发脚本中具备 groupId/ownerId，此处仍做幂等处理。
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = [
      'Customers',
      'Suppliers',
      'Orders',
      'Bookings',
      'CustomsDeclarations',
      'Documents',
      'ShipmentTracks',
      'FinanceRecords',
      'Quotations',
      'Invoices',
    ];
    for (const table of tables) {
      try {
        const cols = await queryInterface.describeTable(table);
        if (!cols.groupId) {
          await queryInterface.addColumn(table, 'groupId', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '数据隔离：归属小组',
          });
        }
        if (!cols.ownerId) {
          await queryInterface.addColumn(table, 'ownerId', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '数据隔离：归属操作员（负责人）',
          });
        }
      } catch {
        // 表尚未创建（如 Quotations/Invoices 在扩展迁移中建表），跳过
      }
    }
  },

  async down(queryInterface) {
    const tables = [
      'Customers',
      'Suppliers',
      'Orders',
      'Bookings',
      'CustomsDeclarations',
      'Documents',
      'ShipmentTracks',
      'FinanceRecords',
      'Quotations',
      'Invoices',
    ];
    for (const table of tables) {
      try {
        const cols = await queryInterface.describeTable(table);
        if (cols.groupId) await queryInterface.removeColumn(table, 'groupId');
        if (cols.ownerId) await queryInterface.removeColumn(table, 'ownerId');
      } catch {
        // 表不存在，跳过
      }
    }
  },
};