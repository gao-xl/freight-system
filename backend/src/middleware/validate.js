const { fail } = require('../utils/response');

// 通用表单校验：joi schema 校验 req.body
// 用法：validate(schema)  其中 schema 为 joi object，可含 .unknown(true)
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body || {}, { abortEarly: false, convert: true });
    if (error) {
      const msg = error.details.map((d) => d.message).join('；');
      return fail(res, `参数校验失败：${msg}`, 1, 400);
    }
    req.body = value;
    next();
  };
}

module.exports = { validate };