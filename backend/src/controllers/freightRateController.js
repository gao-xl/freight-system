const { Op } = require('sequelize');
const { FreightRate } = require('../services/dataAccess');
const { recommend: recommendService } = require('../services/freightRateRecommendService');
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

// P1 运价比价：GET /api/freight-rates/compare
// 同一 originPort+destPort(+containerType) 下，按承运商分组，返回每家「当前最优价」，
// 并标记全场最低价（best），便于一屏对比多家船司、快速锁定最优报价。
const compare = asyncHandler(async (req, res) => {
  const { originPort, destPort, carrier } = req.query;
  if (!originPort || !destPort) return fail(res, '请提供起运港与目的港', 1, 400);
  const containerType = String(req.query.containerType || '').toUpperCase();
  if (containerType && !CONTAINER_TYPES.includes(containerType)) {
    return fail(res, 'containerType 仅支持 20GP/40GP/40HQ', 1, 400);
  }
  const conds = [];
  const where = {};
  if (originPort) where.originPort = originPort;
  if (destPort) where.destPort = destPort;
  if (carrier) where.carrier = carrier;
  if (containerType) where.containerType = containerType;
  const today = new Date();
  conds.push({ [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] });
  conds.push({ [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: today } }] });
  where[Op.and] = conds;
  const finalWhere = await scopedWhere(req, where);
  const rows = await FreightRate.findAll({
    where: finalWhere,
    order: [['carrier', 'ASC'], ['rate', 'ASC']],
    attributes: ['id', 'carrier', 'containerType', 'rate', 'currency', 'validFrom', 'validTo', 'route', 'remark'],
  });
  // 按 承运商+箱型 分组，每组取价格最低的一条
  const bestByKey = new Map();
  for (const r of rows) {
    const key = `${r.carrier}#${r.containerType}`;
    if (!bestByKey.has(key)) bestByKey.set(key, r);
  }
  const list = [...bestByKey.values()];
  // 全场最低价（同箱型下最低，用于高亮）
  const minByType = new Map();
  for (const r of list) {
    const cur = minByType.get(r.containerType);
    if (!cur || Number(r.rate) < Number(cur)) minByType.set(r.containerType, Number(r.rate));
  }
  const listWithBest = list.map((r) => ({
    ...r.toJSON(),
    best: Number(r.rate) <= (minByType.get(r.containerType) ?? Number.POSITIVE_INFINITY),
  }));
  ok(res, { list: listWithBest, total: listWithBest.length });
});

// P2 运价智能推荐：GET /api/freight-rates/recommend
// 结合「当前有效运价」与「历史成交报价（confirmed/converted）」给出最优建议。
const recommend = asyncHandler(async (req, res) => {
  const { originPort, destPort, containerType } = req.query;
  const rateScopeWhere = await scopedWhere(req, {});
  const quoteScopeWhere = await scopedWhere(req, {});
  const result = await recommendService({ originPort, destPort, containerType }, rateScopeWhere, quoteScopeWhere);
  if (result.error) return fail(res, result.error, 1, 400);
  ok(res, result);
});

module.exports = { ...base, search, compare, recommend };
