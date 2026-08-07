// 统一响应封装
function ok(res, data = null, message = 'ok') {
  res.json({ code: 0, message, data });
}

function fail(res, message = '操作失败', code = 1, httpStatus = 400) {
  res.status(httpStatus).json({ code, message, data: null });
}

// 分页参数解析
function getPagination(query) {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize) || 20, 1), 200);
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

// 生成业务编号
function genCode(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}${y}${m}${d}${rand}`;
}

// 异步包装器，捕获错误
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, fail, getPagination, genCode, asyncHandler };