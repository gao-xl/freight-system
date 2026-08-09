const { Op } = require('sequelize');
const { FreightRate } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedWhere } = require('../middleware/dataScope');

// 本地运价小库：标准 CRUD（数据隔离）+ 报价检索
// 权限走 quotation 模块：运价是报价的参考数据，读写范围与报价权限保持一致
const base = crudController({
  name: 'freightRate',
  model: FreightRate,
  searchFields: ['route', 'originPort', 'destPort', 'carrier'],
  order: [['id', 'DESC']],
  scoped: true,
});

const CONTAINER_TYPES = ['20GP', '40GP', '40HQ'];

// 专属检索：GET /api/freight-rates/search
// originPort/destPort/carrier/containerType 精确；keyword 模糊匹配 route/originPort/destPort
// 只取有效期内（validFrom<=today 且 validTo>=today，空视为长期有效）；rate 升序前 50 条
const search = asyncHandler(async (req, res) => {
  const { originPort, destPort, carrier, keyword } = req.query;
  const where = {};
  const conds = [];
  if (originPort) where.originPort = originPort;
  if (destPort) where.destPort = destPort;
  if (carrier) where.carrier = carrier;
  const containerType = String(req.query.containerType || '').toUpperCase();
  if (containerType) {
    if (!CONTAINER_TYPES.includes(containerType)) {
      return fail(res, 'containerType 仅支持 20GP/40GP/40HQ', 1, 400);
    }
    where.containerType = containerType;
  }
  // 有效期过滤：空有效期视为长期有效
  const today = new Date();
  conds.push({ [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] });
  conds.push({ [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: today } }] });
  if (keyword) {
    conds.push({
      [Op.or]: ['route', 'originPort', 'destPort'].map((f) => ({ [f]: { [Op.like]: `%${keyword}%` } })),
    });
  }
  where[Op.and] = conds;
  // 数据隔离：检索仅返回用户可见范围内的运价
  const finalWhere = await scopedWhere(req, where);
  const rows = await FreightRate.findAll({
    where: finalWhere,
    order: [['rate', 'ASC']],
    limit: 50,
  });
  ok(res, { list: rows, total: rows.length });
});

module.exports = { ...base, search };
