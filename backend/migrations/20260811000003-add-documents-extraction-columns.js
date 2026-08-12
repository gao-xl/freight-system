'use strict';

/** @type {import('sequelize-cli').Migration} */
// 修复：Document 模型定义了 extractedText / extractionStatus 两个字段（B5 全文检索），
// 但迁移未为用户在 Documents 表创建这些列，导致 /api/documents 列表报
// "column Document.extractedText does not exist"。此处补列（幂等）。
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'Documents';
    const cols = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      { bind: [table], type: Sequelize.QueryTypes.SELECT },
    );
    const existing = new Set(cols.map((r) => r.column_name));

    const columns = [
      ['extractedText', Sequelize.TEXT, { allowNull: true }],
      ['extractionStatus', Sequelize.ENUM('none', 'pending', 'done', 'failed'), { allowNull: false, defaultValue: 'none' }],
    ];

    for (const [name, type, opts] of columns) {
      if (!existing.has(name)) {
        await queryInterface.addColumn(table, name, { type, ...opts });
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Documents', 'extractionStatus');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Documents_extractionStatus"');
    await queryInterface.removeColumn('Documents', 'extractedText');
  },
};