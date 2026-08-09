'use strict';

// sequelize-cli 配置 — 桥接 src/config/index.js 的环境变量
// 用法：npm run db:migrate（生产 PostgreSQL）/ npm run db:migrate:undo
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  development: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'freight',
    username: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 10, min: 0, idle: 10000 },
    logging: false,
  },
  test: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'freight',
    username: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 10, min: 0, idle: 10000 },
    logging: false,
  },
  production: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'freight',
    username: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 10, min: 0, idle: 10000 },
    logging: false,
  },
};
