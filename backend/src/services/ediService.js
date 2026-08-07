// C2 EDI 对接服务：构建 → 落库 → 传输 → 解析回执
const { EdiMessage, Order, Booking } = require('../models');
const { buildIFTMBF } = require('../edi/edifactBuilder');
const { parse } = require('../edi/edifactParser');
const transport = require('../edi/transport');

// 发送订舱确认报文（IFTMBF）
async function sendBooking({ orderId, bookingId, channel = 'edi', counterparty, sender = 'FREIGHT_SYS' }) {
  const order = await Order.findByPk(orderId);
  if (!order) throw new Error('订单不存在');
  const booking = bookingId ? await Booking.findByPk(bookingId) : null;
  const refNo = `BKG${Date.now().toString().slice(-8)}`;
  const message = buildIFTMBF({
    refNo,
    sender,
    receiver: counterparty || 'CARRIER',
    bookingNo: booking?.bookingNo || '',
    orderNo: order.orderNo,
    containerNo: order.containerNo,
    vesselName: booking?.vesselName,
    voyageNo: booking?.voyageNo,
    originPort: order.originPort,
    destPort: order.destPort,
    cargoDesc: order.cargoDesc,
  });
  const record = await EdiMessage.create({
    direction: 'out', channel, messageType: 'IFTMBF', counterparty,
    orderId: order.id, referenceNo: refNo, rawContent: message, status: 'pending',
  });
  const result = await transport.send({ channel, message, destination: counterparty });
  await record.update({ status: result.ok ? 'sent' : 'failed', error: result.error || null, sentAt: new Date() });
  return { record, message, result };
}

// 解析收到的报文并入库
async function receiveAndParse({ channel = 'edi', raw }) {
  const parsed = parse(raw);
  const record = await EdiMessage.create({
    direction: 'in', channel, messageType: parsed.header.messageType || 'UNKNOWN',
    referenceNo: parsed.header.refNo, rawContent: raw, status: 'received', receivedAt: new Date(),
  });
  return { record, header: parsed.header, segments: parsed.segments };
}

// 查询报文追踪
async function list(q = {}) {
  const where = {};
  if (q.orderId) where.orderId = q.orderId;
  if (q.direction) where.direction = q.direction;
  if (q.messageType) where.messageType = q.messageType;
  return EdiMessage.findAll({ where, order: [['id', 'DESC']], limit: 100 });
}

module.exports = { sendBooking, receiveAndParse, list };