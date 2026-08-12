'use strict';

/** @type {import('sequelize-cli').Migration} */
// 第三方 AI 能力接入：
// 1) 新增权限点 ai:use（使用AI助手）
// 2) 给内置角色（admin/manager/operator/finance/viewer）分配该权限（幂等）
// 3) 预置 IntegrationConfig(code=ai_chat) 对接行（幂等，enabled=false，待用户在外部对接页配置）
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1) 权限点
      const permExist = await queryInterface.sequelize.query(
        `SELECT id FROM "Permissions" WHERE "module" = $1 AND "action" = $2 LIMIT 1`,
        { bind: ['ai', 'use'], type: Sequelize.QueryTypes.SELECT, transaction },
      );
      let permId = permExist.length ? permExist[0].id : null;
      if (!permId) {
        await queryInterface.sequelize.query(
          `INSERT INTO "Permissions" ("module", "action", "name", "code", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          { bind: ['ai', 'use', '使用AI助手', 'ai:use'], type: Sequelize.QueryTypes.INSERT, transaction },
        );
        const back = await queryInterface.sequelize.query(
          `SELECT id FROM "Permissions" WHERE "module" = $1 AND "action" = $2 LIMIT 1`,
          { bind: ['ai', 'use'], type: Sequelize.QueryTypes.SELECT, transaction },
        );
        permId = back.length ? back[0].id : null;
      }

      // 2) 给内置角色分配权限点
      const roleCodes = ['admin', 'manager', 'operator', 'finance', 'viewer'];
      const roles = await queryInterface.sequelize.query(
        `SELECT id, code FROM "Roles" WHERE "code" IN (${roleCodes.map((_, i) => `$${i + 1}`).join(',')})`,
        { bind: roleCodes, type: Sequelize.QueryTypes.SELECT, transaction },
      );
      for (const r of roles) {
        const exists = await queryInterface.sequelize.query(
          `SELECT id FROM "RolePermissions" WHERE "roleId" = $1 AND "permissionId" = $2 LIMIT 1`,
          { bind: [r.id, permId], type: Sequelize.QueryTypes.SELECT, transaction },
        );
        if (!exists.length) {
          await queryInterface.sequelize.query(
            `INSERT INTO "RolePermissions" ("roleId", "permissionId", "createdAt", "updatedAt")
             VALUES ($1, $2, NOW(), NOW())`,
            { bind: [r.id, permId], type: Sequelize.QueryTypes.INSERT, transaction },
          );
        }
      }

      // 3) 预置 ai_chat 对接配置
      const cfgExist = await queryInterface.sequelize.query(
        `SELECT id FROM "IntegrationConfigs" WHERE "code" = $1 LIMIT 1`,
        { bind: ['ai_chat'], type: Sequelize.QueryTypes.SELECT, transaction },
      );
      if (!cfgExist.length) {
        await queryInterface.sequelize.query(
          `INSERT INTO "IntegrationConfigs" ("code", "name", "baseUrl", "authType", "enabled", "config", "remark", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          {
            bind: [
              'ai_chat',
              'AI 大模型（OpenAI 兼容 / OpenRouter）',
              'https://openrouter.ai/api/v1',
              'api_key',
              false,
              JSON.stringify({ model: 'openai/gpt-4o-mini', temperature: 0.3, maxTokens: 2048 }),
              '第三方 AI 统一接入：baseUrl 可指向 OpenRouter/OpenAI/通义/DeepSeek 等 OpenAI 兼容服务；config.model 必填',
            ],
            type: Sequelize.QueryTypes.INSERT,
            transaction,
          },
        );
      }

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    // 拆除：删除 ai:use 权限点及其分配（RolePermissions 级联移除），删除 ai_chat 对接配置
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const perm = await queryInterface.sequelize.query(
        `SELECT id FROM "Permissions" WHERE "module" = $1 AND "action" = $2`,
        { bind: ['ai', 'use'], type: Sequelize.QueryTypes.SELECT, transaction },
      );
      if (perm.length) {
        await queryInterface.sequelize.query(
          `DELETE FROM "RolePermissions" WHERE "permissionId" = $1`,
          { bind: [perm[0].id], type: Sequelize.QueryTypes.DELETE, transaction },
        );
        await queryInterface.sequelize.query(
          `DELETE FROM "Permissions" WHERE "module" = $1 AND "action" = $2`,
          { bind: ['ai', 'use'], type: Sequelize.QueryTypes.DELETE, transaction },
        );
      }
      await queryInterface.sequelize.query(
        `DELETE FROM "IntegrationConfigs" WHERE "code" = $1`,
        { bind: ['ai_chat'], type: Sequelize.QueryTypes.DELETE, transaction },
      );
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};