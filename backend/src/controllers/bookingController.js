const { Booking, Order, Supplier } = require('../models');
const { crudController } = require('./baseController');

const base = crudController({
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

module.exports = base;