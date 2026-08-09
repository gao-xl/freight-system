const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const routes = require('./routes');
const { sequelize } = require('./models');
const { audit } = require('./middleware/audit');
const { logger } = require('./utils/logger');
const { swaggerSpec } = require('./config/swagger');
const { ModuleRegistry } = require('./core/moduleRegistry');
const { startAlertScheduler } = require('./services/alertScheduler');
const { subscribeEvents: subscribeAlertEvents } = require('./services/alertService');
const { subscribeEvents: subscribeAutomationEvents } = require('./services/automationService');
const { subscribe: subscribeNotificationEvents } = require('./services/notificationService');
// Onboarding 地基：启动自动迁移 + 启动自检（bootstrap）
const { runMigrations } = require('./services/migrateRunner');
const { ensureBootstrap } = require('./services/bootstrapService');

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

// 接口文档（Swagger UI + 原始 OpenAPI JSON）
// 挂在 /api-docs 而非 /api/*，不占用业务命名空间，也不受 /api 全局限流影响
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: '货运代理管理系统 接口文档',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/openapi.json', (req, res) => res.json(swaggerSpec));

// 开发文档（VitePress 构建产物）
// 与 /api-docs 一样挂在业务命名空间之外、公开提供，不占独立端口。
// 产物由 docs-site 构建直接输出到 backend/public/docs（见 docs-site 配置 outDir）。
function mountDocs() {
  const fs = require('fs');
  const docsRoot = path.resolve(__dirname, '..', 'public', 'docs');
  if (!fs.existsSync(docsRoot)) {
    logger.warn('[DOCS] 未找到文档构建产物，/docs 不可用。请先在 docs-site 执行 npm run build');
    return;
  }
  // 静态资源（assets/*.js|css、favicon 等）直接命中
  app.use('/docs', express.static(docsRoot, { index: false }));
  // 漂亮 URL 回退：/docs/dev/index → /docs/dev/index.html，/docs/ → index.html
  app.get('/docs/*', (req, res) => {
    const clean = req.path.replace(/\/+$/, '').replace(/^\/docs\/?/, '');
    // 防御性校验：拒绝包含路径穿越的请求
    if (clean.includes('..')) return res.status(400).send('非法路径');
    const candidates = [
      clean || 'index.html',
      `${clean}.html`,
      path.join(clean, 'index.html'),
    ];
    for (const c of candidates) {
      const f = path.join(docsRoot, c);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return res.sendFile(f);
    }
    res.status(404).send('文档页面不存在');
  });
  logger.info('[DOCS] 开发文档已挂载: /docs');
}
mountDocs();

// 业务路由
app.use('/api', routes);

// 404
app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));

// 错误处理
app.use((err, req, res, next) => {
  // 业务错误（带 status 的业务异常）：按业务状态码返回，不记 500
  if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ code: 1, message: err.message || '操作失败', data: null });
  }
  logger.error('Unhandled error', { url: req.originalUrl, message: err.message, stack: err.stack });
  // 不向客户端泄露内部错误详情（SQL/路径/第三方接口信息），仅返回通用文案
  res.status(500).json({ code: 500, message: '服务器内部错误，请联系管理员' });
});

async function start() {
  // Onboarding 地基：先 sync 补齐模型表（老库补新模型表/新库建全表）→ 自动迁移增量修补
  // （AUTO_MIGRATE 默认开；顺序依赖：部分存量迁移依赖模型表已存在，如 invoice-items 依赖 Invoices 表由 sync 创建）
  await sequelize.sync();
  logger.info('[DB] 数据库同步完成');
  if (config.autoMigrate) {
    const applied = await runMigrations();
    if (applied.length) logger.info(`[DB] 自动迁移完成：新增 ${applied.length} 个迁移`);
  }
  const boot = await ensureBootstrap();
  if (boot.needsSetup) {
    logger.info('[BOOT] 系统待初始化：访问 /setup-admin 创建首个管理员');
  }
  // 扫描 src/modules 下的模块目录，登记元信息（模型/菜单/事件）
  // 只做发现与校验，不挂载路由：业务路由的唯一权威来源仍是 src/routes/index.js
  ModuleRegistry.load(path.join(__dirname, 'modules'));
  // 挂载「目录式插件」路由（模块注册协议）：autoMount !== false 的插件自动挂载。
  // 存量模块（order/customer 等）autoMount=false，不会被重复挂载。
  ModuleRegistry.mountRoutes(routes, { guard: require('./middleware/auth').guard });
  // 挂载预警定时任务 + 事件驱动监听
  startAlertScheduler();
  subscribeAlertEvents();
  subscribeAutomationEvents();
  // E2 通知推送：订阅预警/业务事件，出站邮件/企微/通用 Webhook（渠道缺配置自动跳过）
  subscribeNotificationEvents();
  logger.info('[EVENT] 事件驱动监听已启动（预警 + 自动化 + 通知推送）');
  app.listen(config.port, () => {
    logger.info(`[SERVER] 货运代理管理系统后端已启动: http://localhost:${config.port}`);
  });
}

start().catch((e) => {
  console.error('[BOOT] 启动失败:', e);
  process.exit(1);
});