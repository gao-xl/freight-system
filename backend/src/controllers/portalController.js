const { Order, Customer, Booking, CustomsDeclaration, ShipmentTrack, FinanceRecord, Document, User } = require('../models');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { Op } = require('sequelize');

// C5 客户自助门户：customer 角色用户仅可查看自己客户（customerId）的数据
// 全部为只读查询，不提供任何写操作。

// 门户首页：客户概览 + 订单统计
const overview = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const customer = await Customer.findByPk(customerId, { attributes: ['id', 'code', 'name', 'shortName', 'contact', 'phone', 'email'] });
  if (!customer) return fail(res, '客户档案不存在', 1, 404);
  const orders = await Order.findAll({ where: { customerId } });
  const total = orders.length;
  const inProgress = orders.filter((o) => o.status === 'in_progress' || o.status === 'confirmed').length;
  const completed = orders.filter((o) => o.status === 'completed').length;
  const cancelled = orders.filter((o) => o.status === 'cancelled').length;
  // 应收未收
  const finance = await FinanceRecord.findAll({
    where: { direction: 'receivable' },
    include: [{ model: Order, as: 'order', attributes: ['id', 'customerId'], where: { customerId } }],
  });
  let receivableBalance = 0;
  for (const f of finance) receivableBalance += Number(f.amount) - Number(f.paidAmount);
  ok(res, { customer, stats: { total, inProgress, completed, cancelled, receivableBalance }, recentOrders: orders.slice(0, 5) });
});

// 我的订单列表（含订舱/运输/财务摘要）
const myOrders = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const where = { customerId };
  if (status) where.status = status;
  if (keyword) where[Op.or] = ['orderNo', 'containerNo', 'cargoDesc'].map((f) => ({ [f]: { [Op.like]: `%${keyword}%` } }));
  const { rows, count } = await Order.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset, distinct: true });
  ok(res, { list: rows, total: count, page, pageSize });
});

// 订单详情（只读）
const orderDetail = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  const order = await Order.findOne({
    where: { id: req.params.id, customerId },
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
  });
  if (!order) return fail(res, '订单不存在或无权查看', 1, 404);
  const [bookings, customs, tracks, finance, documents] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    FinanceRecord.findAll({ where: { orderId: order.id } }),
    Document.findAll({ where: { orderId: order.id }, attributes: ['id', 'docType', 'docNo', 'title', 'status', 'issueDate'] }),
  ]);
  ok(res, { order, bookings, customs, tracks, finance, documents });
});

// 我的账单（应收明细）
const myBills = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const where = { direction: 'receivable' };
  if (status) where.status = status;
  const { rows, count } = await FinanceRecord.findAndCountAll({
    where,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo', 'customerId'], where: { customerId } }],
    order: [['id', 'DESC']], limit, offset, distinct: true,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

module.exports = { overview, myOrders, orderDetail, myBills };