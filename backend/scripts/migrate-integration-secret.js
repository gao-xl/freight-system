#!/usr/bin/env node
'use strict';

/**
 * IntegrationConfig 第三方密钥存量迁移（S1 安全加固）
 * 运行：node scripts/migrate-integration-secret.js [--rollback]
 *
 * 默认：把历史明文 apiKey 加密为 AES-256-GCM 密文（幂等，已加密的跳过）
 * --rollback：把密文解密回明文（用于紧急回滚/主密钥变更场景）
 *
 * 说明：用原始 SQL 写入，规避模型 beforeSave 钩子对回滚的二次加密；
 * 所有操作仅针对 apiKey 字段，不触碰其他配置。
 */

const { sequelize } = require('../src/models');
const { encryptSecret, decryptSecret, PREFIX } = require('../src/utils/crypto');

const ROLLBACK = process.argv.slice(2).includes('--rollback');

async function main() {
  await sequelize.authenticate();
  // 用原始 SQL 读取 apiKey 原始值，避开模型 afterFind 钩子的自动解密
  const [rows] = await sequelize.query('SELECT id, code, "apiKey" FROM "IntegrationConfigs" ORDER BY id');
  let changed = 0;
  let skipped = 0;
  for (const cfg of rows) {
    const cur = cfg.apiKey;
    if (!cur) { skipped += 1; continue; }
    if (ROLLBACK) {
      if (!cur.startsWith(PREFIX)) { skipped += 1; continue; }
      const plain = decryptSecret(cur);
      if (plain === null) { console.log(`  [跳过] ${cfg.code}: 密文解密失败（主密钥不匹配？）`); continue; }
      await sequelize.query('UPDATE "IntegrationConfigs" SET "apiKey" = :v WHERE id = :id', { replacements: { v: plain, id: cfg.id } });
      changed += 1;
      console.log(`  已回滚 ${cfg.code} 为明文`);
    } else {
      if (cur.startsWith(PREFIX)) { skipped += 1; continue; }
      await sequelize.query('UPDATE "IntegrationConfigs" SET "apiKey" = :v WHERE id = :id', { replacements: { v: encryptSecret(cur), id: cfg.id } });
      changed += 1;
      console.log(`  已加密 ${cfg.code}`);
    }
  }
  await sequelize.close();
  console.log(`\n[迁移完成] ${ROLLBACK ? '回滚' : '加密'} ${changed} 条，跳过 ${skipped} 条（空值/无需处理）`);
}

main().catch((e) => { console.error('\n[迁移失败]:', e.message); process.exit(1); });