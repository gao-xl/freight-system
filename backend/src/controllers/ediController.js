const { ok, fail, asyncHandler } = require('../utils/response');
const ediService = require('../services/ediService');

// 发送订舱 EDI 报文
const sendBooking = asyncHandler(async (req, res) => {
  const { orderId, bookingId, counterparty, channel } = req.body || {};
  if (!orderId) return fail(res, '缺少订单ID');
  try {
    const data = await ediService.sendBooking({ orderId, bookingId, counterparty, channel });
    ok(res, data, 'EDI 报文已发送');
  } catch (e) {
    fail(res, e.message, 1, 400);
  }
});

// 解析并入库一条收到的报文
const receive = asyncHandler(async (req, res) => {
  const { raw, channel } = req.body || {};
  if (!raw) return fail(res, '缺少报文内容');
  const data = await ediService.receiveAndParse({ raw, channel });
  ok(res, { id: data.record.id, header: data.header, status: 'received' }, '报文已解析入库');
});

// 报文追踪查询
const list = asyncHandler(async (req, res) => {
  const data = await ediService.list(req.query);
  ok(res, data);
});

module.exports = { sendBooking, receive, list };