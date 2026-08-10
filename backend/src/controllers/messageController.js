// F6 统一消息中心：站内消息列表 / 未读数 / 已读 / 全部已读 / 订阅偏好
// 数据隔离：只返回当前登录用户（req.user.id）自己的消息，天然按用户隔离
const { MessageRecord, MessagePreference } = require('../services/dataAccess');
const { CATEGORIES } = require('../services/realtimeService');
const { ok, fail, asyncHandler } = require('../utils/response');

// 站内消息列表：GET /messages?page=&pageSize=&unread=1&type=
const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 15));
  const where = { userId: req.user.id };
  if (req.query.unread === '1' || req.query.unread === 'true') where.isRead = false;
  if (req.query.type) where.type = req.query.type;

  const { rows, count } = await MessageRecord.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// 未读数：GET /messages/unread-count
const unreadCount = asyncHandler(async (req, res) => {
  const count = await MessageRecord.count({ where: { userId: req.user.id, isRead: false } });
  ok(res, { count });
});

// 标记单条已读：POST /messages/:id/read
const read = asyncHandler(async (req, res) => {
  const msg = await MessageRecord.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!msg) return fail(res, '消息不存在或无权访问', 1, 404);
  if (!msg.isRead) {
    await msg.update({ isRead: true, readAt: new Date() });
  }
  ok(res, msg);
});

// 全部已读：POST /messages/read-all
const readAll = asyncHandler(async (req, res) => {
  const [affected] = await MessageRecord.update(
    { isRead: true, readAt: new Date() },
    { where: { userId: req.user.id, isRead: false } }
  );
  ok(res, { affected }, affected ? `已将 ${affected} 条消息标记为已读` : '没有未读消息');
});

// ── 订阅偏好 ──
// 读取当前用户订阅偏好：GET /message-preferences（缺省全开）
const getPrefs = asyncHandler(async (req, res) => {
  const rows = await MessagePreference.findAll({ where: { userId: req.user.id } });
  const prefs = {};
  for (const c of CATEGORIES) prefs[c] = true;
  for (const r of rows) if (CATEGORIES.includes(r.type)) prefs[r.type] = r.enabled;
  ok(res, { prefs });
});

// 整体覆盖订阅偏好：PUT /message-preferences  body { prefs: { alert: true, ... } }
// 只存 enabled=false 的关闭项（absence=启用），重建禁用集合同步广播给在线客户端
const updatePrefs = asyncHandler(async (req, res) => {
  const body = (req.body && req.body.prefs) || {};
  const disabled = CATEGORIES.filter((c) => body[c] === false || body[c] === 'false');
  await MessagePreference.destroy({ where: { userId: req.user.id } });
  if (disabled.length) {
    await MessagePreference.bulkCreate(disabled.map((type) => ({ userId: req.user.id, type, enabled: false })));
  }
  const prefs = {};
  for (const c of CATEGORIES) prefs[c] = !disabled.includes(c);
  ok(res, { prefs }, '订阅偏好已更新');
});

module.exports = { list, unreadCount, read, readAll, getPrefs, updatePrefs };