const { BillOfLading, Order, Supplier, Customer, DebitNote } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { scopedWhere, scopedFindOne } = require('../middleware/dataScope');

const base = crudController({
  model: BillOfLading,
  name: 'billOfLading',
  searchFields: ['blNo', 'vessel', 'voyage', 'shipperName', 'consigneeName'],
  includes: [
    { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
    { model: Supplier, as: 'carrier', attributes: ['id', 'name', 'code'] },
    { model: BillOfLading, as: 'masterBl', attributes: ['id', 'blNo', 'blType'] },
  ],
  scoped: true,
});

// 获取主单下的所有分单
const houseBls = asyncHandler(async (req, res) => {
  const master = await scopedFindOne(req, BillOfLading, { id: req.params.id, blType: 'master' });
  if (!master) return fail(res, '主单不存在', 1, 404);
  const rows = await BillOfLading.findAll({
    where: { masterBlId: master.id },
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
    ],
    order: [['id', 'ASC']],
  });
  ok(res, { master: master, houses: rows, count: rows.length });
});

// 获取订单下所有提单
const byOrder = asyncHandler(async (req, res) => {
  const where = await scopedWhere(req, { orderId: req.params.orderId });
  const rows = await BillOfLading.findAll({
    where,
    include: [
      { model: Supplier, as: 'carrier', attributes: ['id', 'name', 'code'] },
      { model: BillOfLading, as: 'masterBl', attributes: ['id', 'blNo', 'blType'] },
    ],
    order: [['blType', 'ASC'], ['id', 'DESC']],
  });
  ok(res, { list: rows, total: rows.length });
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
  houseBls,
  byOrder,
};