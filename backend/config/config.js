// sequelize-cli 配置：从环境变量读取（与 src/config/index.js 保持一致）
require('dotenv').config();
const path = require('path');

const common = {
  logging: false,
  define: { underscored: false, freezeTableName: false },
};

function base() {
  const dialect = process.env.DB_DIALECT || 'sqlite';
  if (dialect === 'postgres') {
    return {
      dialect: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'freight',
      username: process.env.DB_USER || 'freight',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      pool: { max: parseInt(process.env.DB_POOL_MAX) || 10, min: 0, idle: 10000 },
      ...common,
    };
  }
  return {
    dialect: 'sqlite',
    storage: path.resolve(__dirname, '..', process.env.DB_STORAGE || './data/freight.db'),
    ...common,
  };
}

module.exports = {
  development: base(),
  test: { ...base(), storage: path.resolve(__dirname, '..', './data/freight-test.db') },
  production: base(),
};