'use strict';

// P1 性能补丁：核心表普通索引（基线迁移 initial 仅 unique 约束，缺高频筛选字段索引）
// 覆盖：订单列表 status/customerId 筛选、createdAt 排序、销售业绩 salesId；
//       财务应收应付视图（direction+status）、账龄（dueDate）；各子表 orderId 归属过滤。
// 注意：仅对迁移链中建的表加索引（Quotations 等由模型 sync 建表的资源不在本迁移内，
//       避免纯迁移路径下 addIndex 报"表不存在"）。
// 幂等：addIndex 若已存在由 migrateRunner 容错跳过（PostgreSQL）。
module.exports = {
  async up(queryInterface) {
    // Orders（中枢表，列表/筛选/归属/统计最高频）
    await queryInterface.addIndex('Orders', ['customerId'], { name: 'Orders_customerId' });
    await queryInterface.addIndex('Orders', ['status'], { name: 'Orders_status' });
    await queryInterface.addIndex('Orders', ['createdAt'], { name: 'Orders_createdAt' });
    await queryInterface.addIndex('Orders', ['salesId'], { name: 'Orders_salesId' });

    // Customers（列表筛选 + 名称搜索前缀 LIKE）
    await queryInterface.addIndex('Customers', ['status'], { name: 'Customers_status' });
    await queryInterface.addIndex('Customers', ['name'], { name: 'Customers_name' });

    // Users（启用/禁用筛选）
    await queryInterface.addIndex('Users', ['status'], { name: 'Users_status' });

    // FinanceRecords（应收/应付视图 + 账龄预警 + 订单归属）
    await queryInterface.addIndex('FinanceRecords', ['orderId'], { name: 'FinanceRecords_orderId' });
    await queryInterface.addIndex('FinanceRecords', ['direction', 'status'], { name: 'FinanceRecords_direction_status' });
    await queryInterface.addIndex('FinanceRecords', ['dueDate'], { name: 'FinanceRecords_dueDate' });

    // 子表归属过滤（belongsTo Order）
    await queryInterface.addIndex('Bookings', ['orderId'], { name: 'Bookings_orderId' });
    await queryInterface.addIndex('Bookings', ['status'], { name: 'Bookings_status' });
    await queryInterface.addIndex('CustomsDeclarations', ['orderId'], { name: 'CustomsDeclarations_orderId' });
    await queryInterface.addIndex('CustomsDeclarations', ['status'], { name: 'CustomsDeclarations_status' });
    await queryInterface.addIndex('ShipmentTracks', ['orderId'], { name: 'ShipmentTracks_orderId' });
    await queryInterface.addIndex('Documents', ['orderId'], { name: 'Documents_orderId' });
  },
  async down(queryInterface) {
    const indexes = [
      ['Orders', 'Orders_customerId'], ['Orders', 'Orders_status'],
      ['Orders', 'Orders_createdAt'], ['Orders', 'Orders_salesId'],
      ['Customers', 'Customers_status'], ['Customers', 'Customers_name'],
      ['Users', 'Users_status'],
      ['FinanceRecords', 'FinanceRecords_orderId'],
      ['FinanceRecords', 'FinanceRecords_direction_status'],
      ['FinanceRecords', 'FinanceRecords_dueDate'],
      ['Bookings', 'Bookings_orderId'], ['Bookings', 'Bookings_status'],
      ['CustomsDeclarations', 'CustomsDeclarations_orderId'],
      ['CustomsDeclarations', 'CustomsDeclarations_status'],
      ['ShipmentTracks', 'ShipmentTracks_orderId'], ['Documents', 'Documents_orderId'],
    ];
    for (const [table, name] of indexes) {
      await queryInterface.removeIndex(table, name).catch(() => {});
    }
  },
};
