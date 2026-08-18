const { DebitNote, Order, Supplier, BillOfLading, FinanceRecord } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');
const { assertBodyEditable } = require('../services/periodGuard');

const base = crudController({
  model: DebitNote,
  name: 'debitNote',
  searchFields: ['debitNoteNo', 'remark'],
  includes: [
    { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
    { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code'] },
    { model: BillOfLading, as: 'bl', attributes: ['id', 'blNo', 'blType'] },
  ],
  codePrefix: 'DN',
  codeField: 'debitNoteNo',
  scoped: true,
});

module.exports = {
  list: base.list,
  get: base.get,
  create: base.create,
  update: base.update,
  remove: base.remove,
  batchRemove: base.batchRemove,
  batchUpdate: base.batchUpdate,
  restore: base.restore,
};