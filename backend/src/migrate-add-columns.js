// 增量迁移：为已存在的表补充新增列（不删除数据）
// 用法：node src/migrate-add-columns.js
const { sequelize } = require('./models');

const COLUMNS = [
  // Order 表
  { table: 'Orders', column: 'groupId', type: 'INTEGER', defaultValue: null },
  { table: 'Orders', column: 'ownerId', type: 'INTEGER', defaultValue: null },
  { table: 'Orders', column: 'customFields', type: 'TEXT', defaultValue: null },
  { table: 'Orders', column: 'releaseStatus', type: 'TEXT', defaultValue: "none" },
  // User 表
  { table: 'Users', column: 'groupId', type: 'INTEGER', defaultValue: null },
  { table: 'Users', column: 'customerId', type: 'INTEGER', defaultValue: null },
  // Role 表
  { table: 'Roles', column: 'dataScope', type: 'TEXT', defaultValue: 'all' },
  // Customer 表（A2 客户跟进 + B4 自定义字段）
  { table: 'Customers', column: 'lastFollowAt', type: 'DATE', defaultValue: null },
  { table: 'Customers', column: 'nextFollowAt', type: 'DATE', defaultValue: null },
  { table: 'Customers', column: 'customFields', type: 'TEXT', defaultValue: null },
  // Document 表（B5 文件全文检索）
  { table: 'Documents', column: 'extractedText', type: 'TEXT', defaultValue: null },
  { table: 'Documents', column: 'extractionStatus', type: 'TEXT', defaultValue: 'none' },
];

async function migrate() {
  for (const c of COLUMNS) {
    try {
      const cols = await sequelize.queryInterface.describeTable(c.table);
      if (cols[c.column]) {
        console.log(`[SKIP] ${c.table}.${c.column} 已存在`);
        continue;
      }
      await sequelize.queryInterface.addColumn(c.table, c.column, {
        type: c.type === 'INTEGER' ? sequelize.Sequelize.INTEGER : c.type === 'DATE' ? sequelize.Sequelize.DATE : sequelize.Sequelize.TEXT,
        allowNull: true,
        defaultValue: c.defaultValue !== undefined ? c.defaultValue : null,
      });
      console.log(`[OK] ${c.table}.${c.column} 已添加`);
    } catch (e) {
      console.error(`[ERR] ${c.table}.${c.column}: ${e.message}`);
    }
  }
  // Role 表补 dataScope 默认值（若已有列但为 NULL）
  try {
    await sequelize.query(`UPDATE Roles SET dataScope='all' WHERE dataScope IS NULL`);
    console.log('[OK] Roles.dataScope 空值已回填 all');
  } catch (e) {
    console.log(`[INFO] Role 回填跳过: ${e.message}`);
  }
  console.log('[DONE] 增量列迁移完成');
}

migrate().then(() => process.exit(0)).catch((e) => { console.error('迁移失败:', e); process.exit(1); });