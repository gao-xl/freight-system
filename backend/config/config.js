// sequelize-cli 配置：从环境变量读取（与 src/config/index.js 保持一致）
require('dotenv').config();

const common = {
  logging: false,
  define: { underscored: false, freezeTableName: false },
};

function base() {
  return {
    dialect: 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'freight',
    username: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 30, min: 0, idle: 10000 },
    ...common,
  };
}

module.exports = {
  development: base(),
  test: base(),
  production: base(),
};