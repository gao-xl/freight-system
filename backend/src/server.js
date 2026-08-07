const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');
const { sequelize } = require('./models');
const { audit } = require('./middleware/audit');
const { logger } = require('./utils/logger');
const { startAlertScheduler } = require('./services/alertScheduler');

const app = express();

// 安全头
app.use(helmet());
// CORS 白名单
if (config.corsOrigins && config.corsOrigins.length) {
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
} else {
  app.use(cors({ origin: false }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 全局限流
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
});
app.use('/api', globalLimiter);
// 登录特殊限流
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '登录请求过于频繁，请稍后再试' },
});
app.use('/api/auth/login', loginLimiter);

// 操作审计（记录写操作）
app.use(audit);

// 健康检查
app.get('/api/health', (req, res) => res.json({ status: 'up', time: new Date().toISOString(), env: config.env }));

// 业务路由
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));

// 错误处理
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { url: req.originalUrl, message: err.message, stack: err.stack });
  // 不向客户端泄露内部错误详情（SQL/路径/第三方接口信息），仅返回通用文案
  res.status(500).json({ code: 500, message: '服务器内部错误，请联系管理员' });
});

async function start() {
  await sequelize.sync();
  logger.info('[DB] 数据库同步完成');
  // 挂载预警定时任务
  startAlertScheduler();
  app.listen(config.port, () => {
    logger.info(`[SERVER] 货运代理管理系统后端已启动: http://localhost:${config.port}`);
  });
}

start().catch((e) => {
  console.error('[BOOT] 启动失败:', e);
  process.exit(1);
});