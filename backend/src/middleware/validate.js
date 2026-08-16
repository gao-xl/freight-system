const { fail } = require('../utils/response');
const { logger } = require('../utils/logger');

// 敏感字段列表：记录日志时脱敏
const SENSITIVE_FIELDS = ['password', 'oldPassword', 'newPassword', 'token', 'refreshToken', 'pendingToken'];

// 通用表单校验：joi schema 校验 req.body
// 用法：validate(schema)  其中 schema 为 joi object，可含 .unknown(true)
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, convert: true });
    if (error) {
      const msg = error.details.map((d) => d.message).join('；');
      // 记录详细错误日志（脱敏敏感字段）以便排查
      const safeBody = { ...req.body };
      for (const f of SENSITIVE_FIELDS) {
        if (safeBody[f] !== undefined) safeBody[f] = '***';
      }
      logger.warn('[VALIDATE] 参数校验失败', {
        path: req.originalUrl || req.url,
        schema: schema.describe ? schema._type || 'custom' : 'unknown',
        error: msg,
        body: safeBody,
      });
      return fail(res, `参数校验失败：${msg}`, 1, 400);
    }
    req.body = value;
    next();
  };
}

module.exports = { validate };