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
const { authRequired, requirePermission } = require('./middleware/auth');
const { observability } = require('./middleware/observability');
const { logger } = require('./utils/logger');
const { swaggerSpec } = require('./config/swagger');
const { ModuleRegistry } = require('./core/moduleRegistry');
const { startAlertScheduler, stopAlertScheduler } = require('./services/alertScheduler');
const { startDataRetention, stopDataRetention } = require('./services/dataRetention');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backupScheduler');
const { subscribeEvents: subscribeAlertEvents } = require('./services/alertService');
const { subscribeEvents: subscribeAutomationEvents } = require('./services/automationService');
const { subscribe: subscribeNotificationEvents } = require('./services/notificationService');
const { subscribe: subscribeCustomerNotificationEvents } = require('./services/customerNotificationService'); // P2-4 客户订阅通知
const { subscribe: subscribeRealtime, closeAll: closeRealtime } = require('./services/realtimeService'); // F5/F6 实时推送
// 方案 A：读缓存失效订阅（运价写事件 → 失效 rate 缓存）
const { subscribe: subscribeCacheInvalidation } = require('./services/cacheInvalidation');
// F8 可观测性：Prometheus 指标 + 周期采样
const metricsService = require('./services/metricsService');
const cacheService = require('./services/cacheService');
// Onboarding 地基：启动自动迁移 + 启动自检（bootstrap）
const { runMigrations } = require('./services/migrateRunner');
const { ensureBootstrap } = require('./services/bootstrapService');

const app = express();

// 信任一级反向代理（生产环境经 OpenResty/Nginx 转发），使限流/登录锁定能识别真实客户端 IP
// 而非统一看到 127.0.0.1。仅信任最近一跳，避免伪造 X-Forwarded-For 绕过限流。
app.set('trust proxy', 1);

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

// 可观测性：请求关联 ID + RED 指标 + 慢请求日志（在所有业务/鉴权之前，串联全链路）
app.use(observability);

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

// 健康检查：探活 DB（SELECT 1，5s 超时），DB 不可用时返回 503，供 Docker healthcheck 判定
// 容器健康。与 pg 的 pg_isready 互为补充：本端点在应用层确认连接池可用，而非仅端口可达。
app.get('/api/health', async (req, res) => {
  const timeout = new Promise((r) => setTimeout(() => r(false), 5000));
  const dbOk = await Promise.race([
    sequelize.query('SELECT 1').then(() => true).catch(() => false),
    timeout,
  ]);
  const body = {
    status: dbOk ? 'up' : 'degraded',
    db: dbOk ? 'up' : 'down',
    time: new Date().toISOString(),
    env: config.env,
  };
  res.status(dbOk ? 200 : 503).json(body);
});

// M2/M3 修复：生产环境对监控与文档端点做鉴权，收敛公网暴露面。
// adminOnlyInProd：开发环境放行便于本地调试；生产要求 admin（system:*）登录会话。
function adminOnlyInProd(req, res, next) {
  if (!config.isProd) return next();
  return authRequired(req, res, () => requirePermission('system', '*')(req, res, next));
}
// protectMetrics：生产环境优先接受静态抓取令牌（METRICS_TOKEN，供 Prometheus/Grafana），
// 其次接受 admin 登录会话；令牌未配置时仅 admin 会话可访问。
function protectMetrics(req, res, next) {
  if (!config.isProd) return next();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-metrics-token'] || '';
  if (config.metricsToken && token === config.metricsToken) return next();
  return authRequired(req, res, () => requirePermission('system', '*')(req, res, next));
}

// F8 Prometheus 指标端点：供 Grafana/Prometheus 抓取（文本格式）
app.get('/api/metrics', protectMetrics, async (req, res) => {
  try {
    res.set('Content-Type', metricsService.contentType);
    res.end(await metricsService.registry());
  } catch (e) {
    logger.error('[METRICS] 指标生成失败', { message: e.message });
    res.status(500).end();
  }
});

// 接口文档（Swagger UI + 原始 OpenAPI JSON）
// 挂在 /api-docs 而非 /api/*，不占用业务命名空间，也不受 /api 全局限流影响
// M3 修复：生产环境仅 admin 可访问，避免接口契约与鉴权方式公网泄露
app.use('/api-docs', adminOnlyInProd, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: '货运代理管理系统 接口文档',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/openapi.json', adminOnlyInProd, (req, res) => res.json(swaggerSpec));

// 开发文档（VitePress 构建产物）
// 与 /api-docs 一样挂在业务命名空间之外，不占独立端口。
// M3 修复：生产环境仅 admin 可访问。
// 产物由 docs-site 构建直接输出到 backend/public/docs（见 docs-site 配置 outDir）。
function mountDocs() {
  const fs = require('fs');
  const docsRoot = path.resolve(__dirname, '..', 'public', 'docs');
  if (!fs.existsSync(docsRoot)) {
    logger.warn('[DOCS] 未找到文档构建产物，/docs 不可用。请先在 docs-site 执行 npm run build');
    return;
  }
  // 静态资源（assets/*.js|css、favicon 等）直接命中
  app.use('/docs', adminOnlyInProd, express.static(docsRoot, { index: false }));
  // 漂亮 URL 回退：/docs/dev/index → /docs/dev/index.html，/docs/ → index.html
  app.get('/docs/*', adminOnlyInProd, (req, res) => {
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
// 对外契约入口为版本化前缀 /api/v1（稳定性承诺：破坏性变更走新版本前缀，不破坏已接入方）；
// 保留 /api 作为兼容别名，使内部存量前端与既有脚本无需改动即可继续使用。
app.use('/api/v1', routes);
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

// ---- 优雅停机 ----
// 收到 SIGTERM/SIGINT（docker stop / Ctrl+C）时：停止定时任务 → 停止接收新请求 →
// 等待在途请求完成 → 关闭数据库连接池 → 退出。超过时限仍未完成则强制退出。
const SHUTDOWN_TIMEOUT_MS = 15000;
let server = null;
let shuttingDown = false;

async function closeDb() {
  try {
    await sequelize.close();
    logger.info('[SHUTDOWN] 数据库连接池已关闭');
  } catch (e) {
    logger.error('[SHUTDOWN] 关闭数据库连接失败', { message: e.message });
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[SHUTDOWN] 收到 ${signal}，开始优雅停机（等待在途请求完成，上限 ${SHUTDOWN_TIMEOUT_MS / 1000}s）...`);
  // 停止定时任务，避免停机窗口内重复触发；并等待在途扫描/自动化完成，防止连接池关闭后被调用
  const schedulerDrain = stopAlertScheduler();
  stopDataRetention();
  // 停止备份守护并等待在途备份完成，避免备份写到一半连接池被关闭
  const backupDrain = stopBackupScheduler();
  // F5 SSE 长连接先断开，避免阻塞 server.close 等待空闲连接回收
  closeRealtime();
  // F8 可观测性：停止指标周期采样
  metricsService.stopSampler();
  if (!server) {
    process.exit(0);
    return;
  }
  // 主动断开空闲 keep-alive 连接，加速 server.close 完成
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  const forceTimer = setTimeout(() => {
    logger.warn('[SHUTDOWN] 超时，强制退出（在途请求未在时限内完成）');
    closeDb().finally(() => process.exit(1));
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref(); // 不阻止进程自然退出
  server.close(async () => {
    if (forceTimer) clearTimeout(forceTimer);
    // 等待在途扫描/自动化完成后再关闭连接池，避免「连接池已关闭仍被调用」竞态
    await schedulerDrain;
    await backupDrain;
    await closeDb();
    logger.info('[SHUTDOWN] 已安全退出');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  // Onboarding 地基：开发/测试用 sync 快速建表；生产环境禁止 sync（schema 完全由 migration 管理），
  // 避免意外的 schema 漂移/破坏。所有模型表均有对应迁移（initial + more-tables 等），migrateRunner
  // 幂等容错「already exists」，存量 sync 建的库也能原地补齐。
  if (config.isProd) {
    logger.info('[DB] 生产环境：跳过 sequelize.sync()，表结构由 migration 全量管理');
  } else {
    try {
      await sequelize.sync();
      logger.info('[DB] 数据库同步完成（开发/测试）');
    } catch (e) {
      // sync 幂等容错：非 force 模式下，模型 indexes 里的唯一索引在存量库已存在时会抛 42P07
      // （Sequelize 对唯一索引不加 IF NOT EXISTS）。表与其余索引已由 sync 创建，此处应容忍并继续，
      // 使「seed 后启动服务」「存量 sync 库原地补齐」均不因重复索引而启动失败。
      if (e && e.original && e.original.code === '42P07') {
        logger.warn(`[DB] sync 跳过已存在的对象（${e.original.routine || 'index'}）：${String(e.original.sql || '').slice(0, 200)}`);
      } else {
        throw e;
      }
    }
  }
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
  // 数据保留：每日清理过期审计日志（默认关闭，AUDIT_RETENTION_DAYS>0 启用）
  startDataRetention();
  // 备份守护：强制月度自动备份 + 超期提醒/补备（默认强制开启，BACKUP_AUTO=off 关闭）
  startBackupScheduler();
  subscribeAlertEvents();
  subscribeAutomationEvents();
  // E2 通知推送：订阅预警/业务事件，出站邮件/企微/通用 Webhook（渠道缺配置自动跳过）
  subscribeNotificationEvents();
  // F5/F6 实时推送：订阅业务事件 → 统一消息落库 + SSE 实时广播
  subscribeRealtime();
  // 方案 A：订阅运价写事件 → 失效读缓存
  subscribeCacheInvalidation();
  // P2-4 客户订阅通知：按 PortalSubscription 偏好下发订单/跟踪/账单/报关事件
  subscribeCustomerNotificationEvents();
  // F8 可观测性：启动周期采样（DB 连接池 / 事件循环延迟 / 缓存命中）
  metricsService.startSampler(sequelize, cacheService);
  logger.info('[EVENT] 事件驱动监听已启动（预警 + 自动化 + 通知推送 + 实时推送）');
  server = app.listen(config.port, () => {
    logger.info(`[SERVER] 货运代理管理系统后端已启动: http://localhost:${config.port}`);
  });
}

start().catch((e) => {
  console.error('[BOOT] 启动失败:', e);
  process.exit(1);
});