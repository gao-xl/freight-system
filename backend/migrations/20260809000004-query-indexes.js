'use strict';

// 复合索引补充：覆盖高频查询路径，避免回表/全表扫描。
// 遵循 expand 原则——纯新增索引，不触碰数据，可安全回滚（down 删除索引）。
// 备注：
//   - AlertRecords：预警调度每 30 分钟按 status=active + dueAt 范围扫描，status+dueAt 是关键路径；
//     orderId+status 支撑按订单查预警。
//   - AuditLogs：审计列表按 module + 时间倒序查询。
//   - Orders/Bookings/ShipmentTracks/Quotations：订单列表、销售看板、订舱/跟踪/报价列表的主查询组合。
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('AlertRecords', ['status', 'dueAt'], { name: 'alert_records_status_due_at' });
    await queryInterface.addIndex('AlertRecords', ['orderId', 'status'], { name: 'alert_records_order_status' });
    await queryInterface.addIndex('AuditLogs', ['module', 'createdAt'], { name: 'audit_logs_module_created_at' });
    await queryInterface.addIndex('Orders', ['customerId', 'status'], { name: 'orders_customer_status' });
    await queryInterface.addIndex('Orders', ['salesId', 'status'], { name: 'orders_sales_status' });
    await queryInterface.addIndex('Bookings', ['orderId', 'status'], { name: 'bookings_order_status' });
    await queryInterface.addIndex('ShipmentTracks', ['orderId', 'stage'], { name: 'shipment_tracks_order_stage' });
    await queryInterface.addIndex('Quotations', ['customerId', 'status'], { name: 'quotations_customer_status' });
  },

  async down(queryInterface) {
    const pairs = [
      ['AlertRecords', 'alert_records_status_due_at'],
      ['AlertRecords', 'alert_records_order_status'],
      ['AuditLogs', 'audit_logs_module_created_at'],
      ['Orders', 'orders_customer_status'],
      ['Orders', 'orders_sales_status'],
      ['Bookings', 'bookings_order_status'],
      ['ShipmentTracks', 'shipment_tracks_order_stage'],
      ['Quotations', 'quotations_customer_status'],
    ];
    for (const [table, name] of pairs) {
      // 仅删除本迁移创建的索引；表/索引不存在时静默跳过（幂等）
      await queryInterface.removeIndex(table, name).catch(() => {});
    }
  },
};