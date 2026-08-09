'use strict';

// 权限点补 code 列：修复 initial 迁移曾漏建 code（模型 Permission.code = module:action）
// 覆盖已跑过旧 initial 的存量库；全程幂等，可安全重复执行
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('Permissions');
    if (!cols.code) {
      await queryInterface.addColumn('Permissions', 'code', {
        type: Sequelize.STRING(60),
        allowNull: true, // 先允许空，回填后再建唯一索引
      });
      // 回填：code = module:action（PostgreSQL 支持 || 拼接）
      await queryInterface.sequelize.query(
        "UPDATE `Permissions` SET code = module || ':' || action WHERE code IS NULL OR code = ''"
      );
      const indexes = await queryInterface.showIndex('Permissions');
      if (!indexes.some((i) => i.name === 'permissions_code')) {
        await queryInterface.addIndex('Permissions', ['code'], { name: 'permissions_code', unique: true });
      }
    }
  },
  async down() {
    // 不提供回滚（列删除有数据风险），如需回滚请手动处理
  },
};
