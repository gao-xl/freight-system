// 全局搜索：跨客户/供应商/订单/报价，按关键字模糊检索业务数据
// 权限：各模块按用户权限点分别过滤（无权限模块不出结果）；数据范围沿用 dataScope 隔离
const { Op } = require('sequelize');
const { Customer, Supplier, Order, Quotation } = require('../services/dataAccess');
const { ok, asyncHandler } = require('../utils/response');
const { scopedWhere } = require('../middleware/dataScope');
const { getPermissions } = require('../services/permissionService');

// 模块级读权限判断（含通配）
function canRead(perms, module) {
  if (perms.includes('*')) return true;
  return perms.includes(`${module}:*`) || perms.includes(`${module}:read`);
}

// GET /api/search?keyword=xxx&limit=5
const search = asyncHandler(async (req, res) => {
  const kw = String(req.query.keyword || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 5, 1), 20);
  const result = { keyword: kw, customers: [], suppliers: [], orders: [], quotations: [] };
  if (!kw) return ok(res, result);

  const perms = await getPermissions(req.user.id);
  const like = `%${kw}%`;
  const or = (fields) => fields.map((f) => ({ [f]: { [Op.like]: like } }));

  // 客户
  if (canRead(perms, 'customer')) {
    const where = await scopedWhere(req, { [Op.or]: or(['code', 'name', 'shortName', 'contact', 'phone']) });
    result.customers = await Customer.findAll({
      where,
      attributes: ['id', 'code', 'name', 'type', 'status'],
      limit,
      order: [['id', 'DESC']],
    });
  }

  // 供应商
  if (canRead(perms, 'supplier')) {
    const where = await scopedWhere(req, { [Op.or]: or(['code', 'name', 'shortName', 'contact', 'phone']) });
    result.suppliers = await Supplier.findAll({
      where,
      attributes: ['id', 'code', 'name', 'category', 'status'],
      limit,
      order: [['id', 'DESC']],
    });
  }

  // 订单
  if (canRead(perms, 'order')) {
    const where = await scopedWhere(req, { [Op.or]: or(['orderNo', 'cargoDesc', 'containerNo', 'originPort', 'destPort']) });
    result.orders = await Order.findAll({
      where,
      attributes: ['id', 'orderNo', 'cargoDesc', 'status', 'customerId'],
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
      limit,
      order: [['id', 'DESC']],
    });
  }

  // 报价
  if (canRead(perms, 'quotation')) {
    const where = await scopedWhere(req, { [Op.or]: or(['quoteNo', 'cargoDesc', 'originPort', 'destPort']) });
    result.quotations = await Quotation.findAll({
      where,
      attributes: ['id', 'quoteNo', 'cargoDesc', 'status', 'customerId'],
      include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
      limit,
      order: [['id', 'DESC']],
    });
  }

  ok(res, result);
});

module.exports = { search };