const { ShipmentTrack, Order } = require('../services/dataAccess');
const { crudController } = require('./baseController');

const base = crudController({
  name: 'track',
  model: ShipmentTrack,
  searchFields: ['location', 'description'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  order: [['eventTime', 'DESC']],
  scoped: true,
});

module.exports = base;