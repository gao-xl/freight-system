// 可观测性中间件：请求关联 ID + RED 指标（Rate/Errors/Duration）+ 慢请求日志
// 设计：
//   - 每个请求注入 req.id（X-Request-Id 优先，否则生成），日志与跨调用串联
//   - 记录每条请求的路由、方法、状态码、耗时，超阈值记 warn（慢请求）
//   - 打进日志的字段稳定：reqId / method / route / status / durationMs / ip
// 零依赖、零副作用：失败不阻塞主流程，仅记录
const crypto = require('crypto');
const { logger } = require('../utils/logger');
// F8 可观测性：RED 指标埋点（prometheus）
const metricsService = require('../services/metricsService');

// 慢请求阈值（ms），可经环境变量覆盖；默认 1000ms
const SLOW_THRESHOLD = parseInt(process.env.SLOW_REQUEST_MS) || 1000;

function observability(req, res, next) {
  // 关联 ID：调用方传入则沿用，否则生成
  const inbound = req.get('x-request-id');
  req.id = inbound || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);

  const start = process.hrtime.bigint();
  // 注意：在 app.use('/api', routes) 的挂载上下文里 req.url/req.path 被剥离了 /api 前缀（如 /orders），
  // 故用 req.originalUrl 还原完整路径判断是否 API 路由，否则 API 类指标/安全事件将全部漏记。
  const urlPath = (req.originalUrl || req.url || '').split('?')[0];
  const routePath = req.route ? req.route.path : urlPath;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const level = durationMs >= SLOW_THRESHOLD ? 'warn' : 'info';
    const severity = status >= 500 ? 'error' : level;

    logger.log(severity === 'error' ? 'error' : level, '[REQ]', {
      reqId: req.id,
      method: req.method,
      path: routePath,
      status,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
    });

    // F8 指标埋点：RED 计数 + 耗时直方图（只对 API 路由埋点，健康检查除外避免噪音）
    if (urlPath.startsWith('/api') && urlPath !== '/api/health') {
      metricsService.recordHttp({ method: req.method, route: routePath, status, durationMs });
      if (durationMs >= SLOW_THRESHOLD) metricsService.recordSlow({ method: req.method, route: routePath });
      // A4 加固：区分 401 鉴权失败与 403 权限拒绝，供告警与趋势观察
      if (status === 401) metricsService.recordSecurityEvent('auth_fail');
      else if (status === 403) metricsService.recordSecurityEvent('permission_denied');
    }
  });

  next();
}

module.exports = { observability, SLOW_THRESHOLD };