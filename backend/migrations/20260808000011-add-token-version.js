'use strict';

// D8 JWT 吊销支持：Users 表新增 tokenVersion（签发时写入 token，验证时比对，改密/禁用即作废全部旧 token）
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const cols = await queryInterface.describeTable('Users');
      if (!cols.tokenVersion) {
        await queryInterface.addColumn('Users', 'tokenVersion', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'JWT 吊销版本号',
        });
      }
    } catch (e) {
      // 表不存在则跳过（幂等）
    }
  },
  async down() {
    // 不提供回滚（列删除有数据风险），如需回滚请手动处理
  },
};
