const { Booking, Order, Supplier } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedFindOne } = require('../middleware/dataScope');

const base = crudController({
  name: 'booking',
  model: Booking,
  searchFields: ['bookingNo', 'vesselName', 'flightNo'],
  codePrefix: 'BK',
  codeField: 'bookingNo',
  includes: [
    { model: Order, as: 'order', attributes: ['id', 'orderNo', 'mode', 'cargoDesc'] },
    { model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] },
  ],
  order: [['id', 'DESC']],
  scoped: true,
});

// P0-3 订舱复制：基于现有订舱创建新订舱，保留船名/航次/承运人/箱型等信息
const copy = asyncHandler(async (req, res) => {
  const source = await scopedFindOne(req, Booking, { id: req.params.id });
  if (!source) return fail(res, '订舱不存在', 1, 404);
  const { genCode } = require('../utils/response');
  const newBooking = await Booking.create({
    orderId: source.orderId,
    supplierId: source.supplierId,
    vesselName: source.vesselName,
    voyageNo: source.voyageNo,
    flightNo: source.flightNo,
    containerType: source.containerType,
    containerQty: source.containerQty,
    teu: source.teu,
    status: 'new',
    bookingDate: null,
    bookingNo: genCode('BK'),
    freightCharge: source.freightCharge,
    remark: source.remark ? `(复制自 ${source.bookingNo}) ${source.remark}` : `(复制自 ${source.bookingNo})`,
  });
  ok(res, newBooking, '订舱已复制');
});

module.exports = { ...base, copy };