const { Sequelize } = require('sequelize');
const config = require('../config');
const { logger } = require('../utils/logger');

// 慢查询阈值（ms），可经环境变量覆盖；默认 800ms
const SLOW_SQL_MS = parseInt(process.env.SLOW_SQL_MS) || 800;

// 系统仅支持 PostgreSQL（含连接池、SSL 可选）
module.exports = (() => {
  // 合并 dialectOptions：
  //  - statement_timeout 兜底防慢查询占死连接池；
  //  - connection_timeout 兜底防「库不可达」时连接无限期挂起（TCP 连接黑洞/过滤端口不会触发
  //    ECONNREFUSED 快速失败，node-postgres 默认 connectionTimeoutMillis=0 会无限等待），
  //    默认 5s，经 DB_CONNECT_TIMEOUT 覆盖。这是 npm test 在本地 PG 未启动时挂起 18 分钟的根因之一。
  //  - 开启 SSL 时叠加 ssl 配置
  const dialectOptions = {
    statement_timeout: config.db.statementTimeout || 10000,
    connection_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 5000,
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