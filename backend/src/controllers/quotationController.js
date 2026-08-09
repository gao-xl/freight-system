const { Quotation, QuotationItem, Customer, Supplier } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedWhere, scopedFindOne, attachOwnership } = require('../middleware/dataScope');
const svc = require('../services/quotationService');

const base = crudController({
  name: 'quotation',
  model: Quotation,
  searchFields: ['quoteNo', 'cargoDesc', 'originPort', 'destPort'],
  codePrefix: 'QT',
  codeField: 'quoteNo',
  includes: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  order: [['id', 'DESC']],
});

// 列表（含明细，供转订单/详情预览）
const list = asyncHandler(async (req, res) => {
  const { page, pageSize, offset, limit } = (() => {
    const p = Math.max(parseInt(req.query.page) || 1, 1);
    const ps = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 200);
    return { page: p, pageSize: ps, offset: (p - 1) * ps, limit: ps };
  })();
  const where = {};
  for (const key of Object.keys(req.query)) {
    if (['page', 'pageSize', 'keyword'].includes(key)) continue;
    const val = req.query[key];
    if (val === '' || val === undefined || val === null) continue;
    if (Quotation.rawAttributes[key]) where[key] = val;
  }
  if (req.query.keyword) {
    where[require('sequelize').Op.or] = ['quoteNo', 'cargoDesc', 'originPort', 'destPort']
      .map((f) => ({ [f]: { [require('sequelize').Op.like]: `%${req.query.keyword}%` } }));
  }
  const finalWhere = await scopedWhere(req, where);
  const { rows, count } = await Quotation.findAndCountAll({
    where: finalWhere,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
      { model: QuotationItem, as: 'items' },
    ],
    order: [['id', 'DESC']],
    offset,
    limit,
    distinct: true,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// 详情（含明细）
const get = asyncHandler(async (req, res) => {
  const item = await scopedFindOne(req, Quotation, { id: req.params.id }, [
    { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
    { model: QuotationItem, as: 'items', include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] }] },
  ]);
  if (!item) return fail(res, '报价单不存在', 1, 404);
  ok(res, item);
});

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  await attachOwnership(req, body);
  const quotation = await svc.createQuotation(body);
  ok(res, quotation, '报价单创建成功');
});

const update = asyncHandler(async (req, res) => {
  const existing = await scopedFindOne(req, Quotation, { id: req.params.id });
  if (!existing) return fail(res, '报价单不存在', 1, 404);
  const quotation = await svc.updateQuotation(req.params.id, req.body);
  ok(res, quotation, '报价单更新成功');
});

const remove = asyncHandler(async (req, res) => {
  const quotation = await scopedFindOne(req, Quotation, { id: req.params.id });
  if (!quotation) return fail(res, '报价单不存在', 1, 404);
  if (quotation.status !== 'draft' && quotation.status !== 'cancelled') {
    return fail(res, '仅草稿/已取消的报价单可删除');
  }
  await QuotationItem.destroy({ where: { quotationId: quotation.id } });
  await quotation.destroy();
  ok(res, null, '删除成功');
});

const send = asyncHandler(async (req, res) => {
  const existing = await scopedFindOne(req, Quotation, { id: req.params.id });
  if (!existing) return fail(res, '报价单不存在', 1, 404);
  const q = await svc.transition(req.params.id, 'sent', ['draft'], () => 'sent');
  ok(res, q, '已标记为发送');
});

const confirm = asyncHandler(async (req, res) => {
  const existing = await scopedFindOne(req, Quotation, { id: req.params.id });
  if (!existing) return fail(res, '报价单不存在', 1, 404);
  const q = await svc.transition(req.params.id, 'confirmed', ['sent'], () => 'confirmed');
  ok(res, q, '客户已确认');
});

const convertOrder = asyncHandler(async (req, res) => {
  const existing = await scopedFindOne(req, Quotation, { id: req.params.id });
  if (!existing) return fail(res, '报价单不存在', 1, 404);
  const result = await svc.convertOrder(req.params.id, req.body);
  ok(res, result, '已转化为订单');
});

const stats = asyncHandler(async (req, res) => {
  ok(res, await svc.stats());
});

module.exports = { ...base, list, get, create, update, remove, send, confirm, convertOrder, stats };