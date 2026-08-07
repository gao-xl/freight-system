const crypto = require('crypto');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// 生产/测试环境强制 JWT_SECRET，防止默认密钥被伪造
// 生产环境必须设置环境变量 JWT_SECRET，缺失则拒绝启动
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('生产环境必须设置环境变量 JWT_SECRET（高强度随机串）');
}
if (isTest && !process.env.JWT_SECRET) {
  throw new Error('测试环境必须设置环境变量 JWT_SECRET（高强度随机串）');
}

// JWT 密钥：生产/测试用环境变量；仅开发环境允许一次性随机生成（绝不写死）
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET && !isTest) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] 开发环境使用随机 JWT_SECRET（本次进程有效），生产环境请通过环境变量配置高强度密钥（参考 .env.example）');
}

module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  isProd,
  jwtSecret,
  jwtExpiresIn: '12h',
  db: {
    storage: process.env.DB_STORAGE || './data/freight.db',
    dialect: process.env.DB_DIALECT || 'sqlite',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'freight',
    user: process.env.DB_USER || 'freight',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    pool: { max: parseInt(process.env.DB_POOL_MAX) || 10, min: 0, idle: 10000 },
    logging: false,
  },
  // CORS 白名单（逗号分隔），生产必填
  corsOrigins: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  // 限流参数
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 分钟
    max: parseInt(process.env.RATE_LIMIT_MAX) || 300, // 全局限流
    loginMax: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 20, // 登录次数
  },
  // 外部系统对接配置（端口/海关/财务等），可在运行期通过 IntegrationConfig 表动态维护
  integrations: {
    port: process.env.PORT_SVC_URL || 'http://localhost:4001',
    customs: process.env.CUSTOMS_SVC_URL || 'http://localhost:4002',
    finance: process.env.FINANCE_SVC_URL || 'http://localhost:4003',
  },
};