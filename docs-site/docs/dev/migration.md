---
title: 数据库迁移
prev: /dev/permissions
next: /dev/best-practices
---

# 数据库迁移

> `seed.js` 会 force sync **清空重建**数据库，仅用于初始化/重置。**已有数据的生产环境改表，必须用迁移脚本**（`backend/migrations/`），否则会丢数据。

## 1. 命名规范

`YYYYMMDDHHMMSS-描述.js`（UTC 风格时间戳）：

```
20260808000010-soft-delete-version.js
20260808000009-report-definitions.js
20260808000008-workflow-configs.js
20260808000007-settle-month.js
20260808000006-business-rules.js
20260808000004-custom-fields-columns.js
20260808000000-accounting-period.js
```

## 2. 迁移文件结构

标准 sequelize-cli 迁移：

```js
'use strict';
module.exports = {
  async up(queryInterface, Sequelize) { /* 建表/加列/加索引/数据 */ },
  async down(queryInterface) { /* 回滚 */ },
};
```

## 3. 三种典型写法

### ① 建表（幂等）

```js
async up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('ReportDefinitions')) return;   // 幂等：已存在跳过
  await queryInterface.createTable('ReportDefinitions', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: Sequelize.STRING(100), allowNull: false },
    // ...
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
  });
  await queryInterface.addIndex('ReportDefinitions', ['bizType', 'enabled']);
}
```

> 表名用模型复数（`ReportDefinitions` / `WorkflowConfigs`）。

### ② 加列 / 软删

```js
async up(queryInterface, Sequelize) {
  const cols = await queryInterface.describeTable('Orders');
  if (cols.customFields) return;                       // 已存在跳过
  await queryInterface.addColumn('Orders', 'customFields', {
    type: Sequelize.JSON, allowNull: true, comment: '自定义字段',
  });
}
// down: removeColumn
```

### ③ 数据迁移（参数化）

```js
async up(queryInterface, Sequelize) {
  await queryInterface.sequelize.query(
    `UPDATE ... WHERE ...`,
    { replacements: { ... } }
  );
  // 或用 bulkInsert / bulkDelete，全流程幂等（已存在跳过）
}
```

## 4. 执行迁移

```bash
cd backend
npx sequelize-cli db:migrate     # 跑所有待执行迁移
npx sequelize-cli db:migrate:undo # 回滚最后一个
```

## 5. 纪律

- **迁移必须幂等**：`showAllTables` / `describeTable` 判断后再操作，重复执行不报错
- **金额字段用 DECIMAL**：`Sequelize.DECIMAL(14, 2)`，禁止 FLOAT
- **生产不建表用 seed**：建表/改表一律走迁移；`seed.js` 只用于初始化填充
- **改动后跑回归**：`node src/regression.js` 验证核心链路

> 若数据库是 PostgreSQL，迁移同样适用（sequelize-cli 会根据 config 里的 dialect 生成对应 DDL）。

## 下一步

[纪律与最佳实践](/dev/best-practices) —— 汇总常见坑与红线。