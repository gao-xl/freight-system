// 结构化日志（winston）：控制台 + 文件滚动
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// 确保日志目录存在
const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'app.log'), maxsize: 10 * 1024 * 1024, maxFiles: 5 }),
  ],
});

// 日志脱敏：隐藏 token / 密码 / apiKey / 卡号
function mask(str) {
  return String(str)
    .replace(/(token|password|api[keyK]?|secret|authorization)[":\s=]+([^\s,;]+)/gi, '$1=***')
    .replace(/\b\d{10,}\b/g, '***');
}

// 带请求上下文的日志器：reqLog(req).info(...) 自动带上 reqId
// 用法：reqLog(req).error('[AUTH] 校验异常', { message: e.message })
function reqLog(req) {
  const reqId = req && (req.id || req.headers && req.headers['x-request-id']);
  const wrap = (level) => (...args) => {
    const [msg, meta = {}] = args;
    const enriched = reqId ? { ...meta, reqId } : meta;
    logger.log(level, msg, enriched);
  };
  return {
    error: wrap('error'),
    warn: wrap('warn'),
    info: wrap('info'),
    debug: wrap('debug'),
  };
}

module.exports = { logger, mask, reqLog };