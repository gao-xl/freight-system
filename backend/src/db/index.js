const { Sequelize } = require('sequelize');
const config = require('../config');

// 系统仅支持 PostgreSQL（含连接池、SSL 可选）
const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'postgres',
  logging: config.db.logging,
  pool: config.db.pool,
  dialectOptions: config.db.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  define: { underscored: false, freezeTableName: false },
});

module.exports = sequelize;