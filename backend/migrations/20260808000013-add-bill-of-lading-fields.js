'use strict';

// D2 提单三要素字段：Order 补 shipper/consignee/notifyParty/marks 等
// 提单模板（bl）要打出标准版式必须有数据可填，此前 Order 只有 customerId，三要素无处安放。
// 全程幂等（describeTable 检查列），可安全重复执行；down 不提供回滚。
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('Orders');
    const addIfMissing = async (name, type, opts) => {
      if (!cols[name]) await queryInterface.addColumn('Orders', name, { type, ...opts });
    };
    await addIfMissing('shipperName', Sequelize.STRING(200), { allowNull: true });
    await addIfMissing('shipperAddress', Sequelize.STRING(500), { allowNull: true });
    await addIfMissing('consigneeName', Sequelize.STRING(200), { allowNull: true });
    await addIfMissing('consigneeAddress', Sequelize.STRING(500), { allowNull: true });
    await addIfMissing('notifyParty', Sequelize.STRING(500), { allowNull: true });
    await addIfMissing('marksNumbers', Sequelize.TEXT, { allowNull: true });
    await addIfMissing('placeOfReceipt', Sequelize.STRING(100), { allowNull: true });
    await addIfMissing('placeOfDelivery', Sequelize.STRING(100), { allowNull: true });
    await addIfMissing('freightCharges', Sequelize.STRING(255), { allowNull: true }); // 运费条款（如 FREIGHT PREPAID）
    await addIfMissing('originalBLCount', Sequelize.INTEGER, { allowNull: true, defaultValue: 3 }); // 正本份数
    await addIfMissing('telexRelease', Sequelize.BOOLEAN, { allowNull: true, defaultValue: false }); // 电放
  },
  async down() {
    // 不提供回滚（列删除有数据风险）
  },
};
