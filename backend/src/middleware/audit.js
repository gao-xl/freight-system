// 操作审计中间件：记录关键写操作（谁、何时、对什么资源做了什么）
// 写操作落库到 AuditLog 表，供系统管理检索
const { record: auditRecord } = require('../core/auditService');

// 从路径推断模块名
function inferModule(path) {
  const seg = (path || '').split('?')[0].split('/').filter(Boolean);
  return seg[0] === 'api' ? (seg[1] || '') : (seg[0] || '');
}

function audit(req, res, next) {
  const method = req.method;
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (!isWrite) return next();

  res.on('finish', async () => {
    try {
      if (res.statusCode >= 400) return;
      const actor = req.user?.username || req.user?.name || 'anonymous';
      const module = inferModule(req.originalUrl);
      // 提取目标 id（路径末段数字）
      const segs = req.originalUrl.split('?')[0].split('/').filter((s) => /^\d+$/.test(s));
      const targetId = segs.length ? segs[segs.length - 1] : null;
      const action = method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'update' : 'delete';
      await auditRecord({
        userId: req.user?.id || null,
        username: actor,
        module,
        action,
        method,
        path: req.originalUrl,
        targetId,
        summary: `${action} ${module}${targetId ? ` #${targetId}` : ''}`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    } catch (e) {
      // 审计失败不影响主流程
    }
  });
  next();
}

module.exports = { audit };