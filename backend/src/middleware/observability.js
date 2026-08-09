// 可观测性中间件：请求关联 ID + RED 指标（Rate/Errors/Duration）+ 慢请求日志
// 设计：
//   - 每个请求注入 req.id（X-Request-Id 优先，否则生成），日志与跨调用串联
//   - 记录每条请求的路由、方法、状态码、耗时，超阈值记 warn（慢请求）
//   - 打进日志的字段稳定：reqId / method / route / status / durationMs / ip
// 零依赖、零副作用：失败不阻塞主流程，仅记录
const crypto = require('crypto');
const { logger } = require('../utils/logger');

// 慢请求阈值（ms），可经环境变量覆盖；默认 1000ms
const SLOW_THRESHOLD = parseInt(process.env.SLOW_REQUEST_MS) || 1000;

function observability(req, res, next) {
  // 关联 ID：调用方传入则沿用，否则生成
  const inbound = req.get('x-request-id');
  req.id = inbound || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);

  const start = process.hrtime.bigint();
  const routePath = req.route ? req.route.path : req.path;

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
  });

  next();
}

module.exports = { observability, SLOW_THRESHOLD };