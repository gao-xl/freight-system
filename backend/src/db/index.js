const { Sequelize } = require('sequelize');
const config = require('../config');
const path = require('path');
const fs = require('fs');

let sequelize;

if (config.db.dialect === 'postgres') {
  // PostgreSQL 生产库（含连接池、SSL 可选）
  sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'postgres',
    logging: config.db.logging,
    pool: config.db.pool,
    dialectOptions: config.db.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    define: { underscored: false, freezeTableName: false },
  });
} else {
  // SQLite 本地开发/演示库
  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.resolve(__dirname, '../../', config.db.storage.replace('./', '')),
    logging: config.db.logging,
    define: { underscored: false, freezeTableName: false },
  });
}

module.exports = sequelize;