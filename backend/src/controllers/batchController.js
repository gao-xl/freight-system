const { FinanceRecord, Booking, Order, Document } = require('../services/dataAccess');
const { ok, fail, asyncHandler, genCode } = require('../utils/response');
const { scopedWhere } = require('../middleware/dataScope');
const { Op } = require('sequelize');
const { sequelize } = require('../services/dataAccess');

// 批量核销财务记录
const batchWriteOff = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return fail(res, '请选择至少一条记录', 1, 400);
  }
  const finalWhere = await scopedWhere(req, { id: { [Op.in]: ids } });
  const [count] = await FinanceRecord.update(
    { status: 'paid', paidAmount: sequelize.literal('amount'), paidDate: new Date() },
    { where: finalWhere }
  );
  ok(res, { count }, `已核销 ${count} 条记录`);
});

// 批量生成订舱
const batchBooking = asyncHandler(async (req, res) => {
  const { orderIds, supplierId, vesselName, voyageNo, containerType, containerQty } = req.body;
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return fail(res, '请选择至少一个订单', 1, 400);
  }
  const finalWhere = await scopedWhere(req, { id: { [Op.in]: orderIds } });
  const orders = await Order.findAll({ where: finalWhere });
  if (orders.length === 0) return fail(res, '未找到可操作的订单', 1, 404);

  const ct = containerType || '20GP';
  const qty = containerQty || 1;
  const teuPerBox = ct.includes('40') ? 2 : 1;

  const created = [];
  const t = await sequelize.transaction();
  try {
    for (const order of orders) {
      const booking = await Booking.create({
        orderId: order.id,
        supplierId: supplierId || null,
        vesselName: vesselName || '',
        voyageNo: voyageNo || '',
        containerType: ct,
        containerQty: qty,
        teu: qty * teuPerBox,
        status: 'new',
        bookingNo: genCode('BK'),
        bookingDate: new Date(),
      }, { transaction: t });
      created.push(booking);
    }
    await t.commit();
    ok(res, { count: created.length, bookings: created }, `已生成 ${created.length} 条订舱`);
  } catch (e) {
    await t.rollback();
    throw e;
  }
});

// 批量打印（合并导出）
const batchPrint = asyncHandler(async (req, res) => {
  const { ids, docType } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return fail(res, '请选择至少一条记录', 1, 400);
  }
  if (!docType) return fail(res, '请指定单据类型', 1, 400);

  const modelMap = { order: Order, booking: Booking, document: Document };
  const Model = modelMap[docType];
  if (!Model) return fail(res, '不支持的单据类型', 1, 400);

  const finalWhere = await scopedWhere(req, { id: { [Op.in]: ids } });
  const rows = await Model.findAll({ where: finalWhere, order: [['id', 'ASC']] });

  // 只返回打印所需的关键字段，避免暴露完整数据行
  const safeFields = {
    order: ['id', 'orderNo', 'cargoDesc', 'originPort', 'destPort', 'mode', 'serviceType', 'createdAt'],
    booking: ['id', 'bookingNo', 'vesselName', 'voyageNo', 'containerType', 'containerQty', 'status'],
    document: ['id', 'docNo', 'docType', 'docName', 'status', 'createdAt'],
  };
  const fields = safeFields[docType] || Object.keys(rows[0]?.toJSON?.() || {});
  const sanitized = rows.map((r) => {
    const raw = r.toJSON ? r.toJSON() : r;
    return Object.fromEntries(fields.map((f) => [f, raw[f]]));
  });

  ok(res, { count: sanitized.length, rows: sanitized, docType }, `已准备 ${sanitized.length} 份单据打印数据`);
});

module.exports = { batchWriteOff, batchBooking, batchPrint };