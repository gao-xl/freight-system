'use strict';

// M3 JWT refresh token + 端线下线：Sessions 表存储每端 opaque refresh token 的哈希
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Sessions', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false },
      ver: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      deviceLabel: { type: Sequelize.STRING(100) },
      ip: { type: Sequelize.STRING(64) },
      userAgent: { type: Sequelize.STRING(512) },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      revokedAt: { type: Sequelize.DATE },
      lastUsedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    // 唯一索引：同一 refresh token 只允许一条有效会话
    await queryInterface.addIndex('Sessions', ['tokenHash'], { unique: true, name: 'sessions_token_hash_uidx' });
    // 撤销/过期清理与按用户查询会话
    await queryInterface.addIndex('Sessions', ['userId'], { name: 'sessions_user_id_idx' });
    await queryInterface.addIndex('Sessions', ['revokedAt'], { name: 'sessions_revoked_at_idx' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('Sessions');
  },
};