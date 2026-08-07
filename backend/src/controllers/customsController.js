const { CustomsDeclaration, Order, Supplier } = require('../models');
const { crudController } = require('./baseController');

const base = crudController({
  name: 'customs',
  model: CustomsDeclaration,
  searchFields: ['declNo', 'customsNo', 'hsCode'],
  codePrefix: 'DC',
  codeField: 'declNo',
  includes: [
    { model: Order, as: 'order', attributes: ['id', 'orderNo', 'cargoDesc'] },
    { model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] },
  ],
  order: [['id', 'DESC']],
  scoped: true,
});

module.exports = base;