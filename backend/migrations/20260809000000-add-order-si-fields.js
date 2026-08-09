'use strict';

// E3 客户门户在线补料（SI）：Order 补 siStatus/siData/siSubmittedAt/siSubmittedBy/siSubmittedByName
// 客户在门户提交 SI 后落订单，操作员在订单详情可见补料状态与原文。
// 全程幂等（describeTable 检查列），可安全重复执行；down 不提供回滚（列删除有数据风险）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('Orders');
    const addIfMissing = async (name, type, opts) => {
      if (!cols[name]) await queryInterface.addColumn('Orders', name, { type, ...opts });
    };
    await addIfMissing('siStatus', Sequelize.ENUM('none', 'submitted', 'confirmed', 'rejected'), { allowNull: true, defaultValue: 'none' });
    await addIfMissing('siData', Sequelize.TEXT, { allowNull: true });
    await addIfMissing('siSubmittedAt', Sequelize.DATE, { allowNull: true });
    await addIfMissing('siSubmittedBy', Sequelize.INTEGER, { allowNull: true });
    await addIfMissing('siSubmittedByName', Sequelize.STRING(50), { allowNull: true });
  },
  async down() {
    // 不提供回滚（列删除有数据风险）
  },
};
