const { Sequelize } = require('sequelize');
const config = require('../config');
const { logger } = require('../utils/logger');

// 慢查询阈值（ms），可经环境变量覆盖；默认 800ms
const SLOW_SQL_MS = parseInt(process.env.SLOW_SQL_MS) || 800;

// 系统仅支持 PostgreSQL（含连接池、SSL 可选）
module.exports = (() => {
  // 合并 dialectOptions：statement_timeout 兜底防慢查询占死连接池；开启 SSL 时叠加 ssl 配置
  const dialectOptions = {
    statement_timeout: config.db.statementTimeout || 10000,
  };
  if (config.db.ssl) {
    dialectOptions.ssl = { require: true, rejectUnauthorized: false };
  }
  const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'postgres',
    logging: (sql, timing) => {
      // 慢查询（带 benchmark 时 timing 为耗时 ms）记 warn，便于定位性能瓶颈
      if (timing && timing >= SLOW_SQL_MS) {
        logger.warn('[SLOW-SQL]', { durationMs: Math.round(timing), sql: String(sql).slice(0, 500) });
      }
    },
    benchmark: true,
    pool: config.db.pool,
    dialectOptions,
    define: { underscored: false, freezeTableName: false },
  });
  return sequelize;
})();