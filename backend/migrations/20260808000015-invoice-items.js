'use strict';

// N2 发票明细行：Invoice 加 items JSON（[{financeId, description, amount, currency}]）
// 支持"从费用勾选生成开票行 + 部分开票 + 费用↔发票勾稽"。幂等。
module.exports = {
  async up(queryInterface, Sequelize) {
    // Invoices 表由 sequelize.sync 按模型创建，空库迁移时可能尚不存在（模型已带 items 列，sync 会自动补齐），
    // 此时跳过即可；老库升级场景 Invoices 已存在且缺 items 时补列。
    try {
      const cols = await queryInterface.describeTable('Invoices');
      if (!cols.items) {
        await queryInterface.addColumn('Invoices', 'items', { type: Sequelize.TEXT, allowNull: true });
      }
    } catch (e) {
      // 表不存在：跳过，sync 阶段由模型补齐
      const msg = (e && (e.message || '')) || '';
      if (/no such table|no description found|does not exist/i.test(msg)) {
        // skip
      } else {
        throw e;
      }
    }
  },
  async down() {
    // 不提供回滚
  },
};
