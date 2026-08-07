'use strict';

// 接口密钥表：面向脚本 / 定时任务 / 第三方系统的非交互式认证凭据
// 字段与 src/models/ApiKey.js 一一对应，改模型必须同步改本迁移。
// SQLite 与 PostgreSQL 均可执行：只用 createTable + addIndex，未使用方言专有语法。
module.exports = {
  async up(queryInterface, Sequelize) {
    // 幂等：本地开发常先跑过 sequelize.sync() 建好表，重复建表会直接报错
    const existing = await queryInterface.showAllTables();
    const normalized = existing.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (normalized.includes('ApiKeys')) return;

    await queryInterface.createTable('ApiKeys', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      // 明文密钥的 SHA-256 摘要（64 位十六进制）；明文不落库
      keyHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      // 绑定用户：密钥权限不超过该用户，审计身份亦取自该用户
      userId: { type: Sequelize.INTEGER, allowNull: false },
      // 密钥角色（对应 Roles.code），用于进一步收窄权限
      role: { type: Sequelize.STRING(20) },
      name: { type: Sequelize.STRING(100), allowNull: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      lastUsedAt: { type: Sequelize.DATE },
      // 为空表示长期有效
      expiresAt: { type: Sequelize.DATE },
      // 数据隔离：归属小组
      groupId: { type: Sequelize.INTEGER },
      // 数据隔离：归属操作员
      ownerId: { type: Sequelize.INTEGER },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 认证走 keyHash 精确查找，属于每请求热路径，单独建索引
    // unique 约束在部分方言下已隐含索引，加 try 保证重复创建不阻断迁移
    try {
      await queryInterface.addIndex('ApiKeys', ['keyHash'], { name: 'api_keys_key_hash', unique: true });
    } catch {
      // 索引已存在（unique 约束自动创建），跳过
    }
    // 按用户查自己的密钥列表
    try {
      await queryInterface.addIndex('ApiKeys', ['userId'], { name: 'api_keys_user_id' });
    } catch {
      // 索引已存在，跳过
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ApiKeys');
  },
};
