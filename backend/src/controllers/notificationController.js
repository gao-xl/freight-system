'use strict';

// E2 通知推送记录查询（管理端）
const notificationService = require('../services/notificationService');
const { ok, asyncHandler, getPagination } = require('../utils/response');

// GET /api/notifications?page=1&pageSize=20&eventType=alert.created&channel=email&status=failed
const list = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const data = await notificationService.listRecords({
    eventType: req.query.eventType,
    channel: req.query.channel,
    status: req.query.status,
    targetId: req.query.targetId,
    page,
    pageSize,
  });
  ok(res, data);
});

module.exports = { list };
