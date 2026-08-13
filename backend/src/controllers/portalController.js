const { Order, Customer, Booking, CustomsDeclaration, ShipmentTrack, FinanceRecord, Document, User, Invoice, FreightRate } = require('../services/dataAccess');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { Op } = require('sequelize');
const printService = require('../services/printService');
const { recommend: recommendService } = require('../services/freightRateRecommendService');
const { readThrough } = require('../services/readCache');
const config = require('../config');

// C5 客户自助门户：customer 角色用户仅可查看自己客户（customerId）的数据
// 全部为只读查询，不提供任何写操作。

// 门户首页：客户概览 + 订单统计
const overview = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const customer = await Customer.findByPk(customerId, { attributes: ['id', 'code', 'name', 'shortName', 'contact', 'phone', 'email'] });
  if (!customer) return fail(res, '客户档案不存在', 1, 404);
  const orders = await Order.findAll({ where: { customerId } });
  const total = orders.length;
  const inProgress = orders.filter((o) => o.status === 'in_progress' || o.status === 'confirmed').length;
  const completed = orders.filter((o) => o.status === 'completed').length;
  const cancelled = orders.filter((o) => o.status === 'cancelled').length;
  // 应收未收（P1-5 修复：先取本客户订单 id 集合，再按 orderId IN 查询，
  // 避免先全量扫 receivable 再 JOIN 过滤的全表扫描，数据量增长后性能更好）
  const orderIds = orders.map((o) => o.id);
  const finance = orderIds.length
    ? await FinanceRecord.findAll({ where: { direction: 'receivable', orderId: { [Op.in]: orderIds } } })
    : [];
  let receivableBalance = 0;
  for (const f of finance) receivableBalance += Number(f.amount) - Number(f.paidAmount);
  ok(res, { customer, stats: { total, inProgress, completed, cancelled, receivableBalance }, recentOrders: orders.slice(0, 5) });
});

// 我的订单列表（含订舱/运输/财务摘要）
const myOrders = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { status, keyword } = req.query; // U1 修复：解构筛选参数，未解构导致一筛选必 500
  const where = { customerId };
  if (status) where.status = status;
  if (keyword) where[Op.or] = ['orderNo', 'containerNo', 'cargoDesc'].map((f) => ({ [f]: { [Op.like]: `%${keyword}%` } }));
  const { rows, count } = await Order.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset, distinct: true });
  ok(res, { list: rows, total: count, page, pageSize });
});

// 订单详情（只读）
const orderDetail = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  const order = await Order.findOne({
    where: { id: req.params.id, customerId },
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
  });
  if (!order) return fail(res, '订单不存在或无权查看', 1, 404);
  const [bookings, customs, tracks, finance, documents] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    FinanceRecord.findAll({ where: { orderId: order.id } }),
    Document.findAll({ where: { orderId: order.id }, attributes: ['id', 'docType', 'docNo', 'title', 'status', 'issueDate'] }),
  ]);
  ok(res, { order, bookings, customs, tracks, finance, documents });
});

// 我的账单（应收明细）
const myBills = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { status } = req.query; // U1 修复：解构筛选参数
  const where = { direction: 'receivable' };
  if (status) where.status = status;
  const { rows, count } = await FinanceRecord.findAndCountAll({
    where,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo', 'customerId'], where: { customerId } }],
    order: [['id', 'DESC']], limit, offset, distinct: true,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// E3 客户门户增强：下载账单/提单 PDF、在线补料（SI）、运价查询
// 全部走既有 JWT + customerId 隔离：仅可访问本客户订单，非本客户订单一律 404。

// 归属校验：订单必须属于当前客户（customerId 隔离），否则返回 null
async function findOwnOrder(customerId, orderId) {
  return Order.findOne({ where: { id: orderId, customerId } });
}

// 门户补料可写入的订单提单字段映射（前端契约字段 → Order 字段）
const SI_MAP = {
  shipper: 'shipperName',            // 发货人（名称+地址合并文本）
  consignee: 'consigneeName',        // 收货人（名称+地址合并文本）
  notifyParty: 'notifyParty',        // 通知方
  marksNumbers: 'marksNumbers',      // 唛头/件数
  cargoDesc: 'cargoDesc',
  remark: 'remark',
  // 细分字段（精确补料场景兼容）
  shipperName: 'shipperName',
  shipperAddress: 'shipperAddress',
  consigneeName: 'consigneeName',
  consigneeAddress: 'consigneeAddress',
  placeOfReceipt: 'placeOfReceipt',
  placeOfDelivery: 'placeOfDelivery',
  freightCharges: 'freightCharges',
  originalBLCount: 'originalBLCount',
  telexRelease: 'telexRelease',
  packageCount: 'packageCount',
  cargoWeight: 'cargoWeight',
  cargoVolume: 'cargoVolume',
  containerNo: 'containerNo',
};

// GET /api/portal/orders/:id/invoices/:invoiceId/download
// 下载账单 PDF：账单记录兼容两种来源——发票（Invoice，docType=invoice 打印链路）
// 或应收费用行（FinanceRecord，docType=debit_note 费用通知单打印链路），均须归属本客户订单
const downloadInvoice = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const order = await findOwnOrder(customerId, req.params.id);
  if (!order) return fail(res, '订单不存在或无权查看', 1, 404);
  const bizId = req.params.invoiceId;
  const invoice = await Invoice.findOne({ where: { id: bizId, orderId: order.id } });
  if (invoice) {
    const { pdf } = await printService.render(null, 'invoice', invoice.id);
    if (!pdf) return fail(res, 'PDF 功能已关闭（服务器低配可选项），请联系管理员开启', 1, 503);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.id}.pdf"`);
    return res.send(pdf);
  }
  const fin = await FinanceRecord.findOne({ where: { id: bizId, orderId: order.id } });
  if (fin) {
    const { pdf } = await printService.render(null, 'debit_note', order.id);
    if (!pdf) return fail(res, 'PDF 功能已关闭（服务器低配可选项），请联系管理员开启', 1, 503);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="debit-note-${order.id}.pdf"`);
    return res.send(pdf);
  }
  return fail(res, '账单不存在或无权下载', 1, 404);
});

// GET /api/portal/orders/:id/documents/:docId/download
// 下载提单 PDF：复用 bl 打印链路（bizId=订单 id，取订单提单数据）
// 另兼容以订单为数据源的 packing_list / order 单据；其余单证类型暂不支持门户下载
const downloadDocument = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const order = await findOwnOrder(customerId, req.params.id);
  if (!order) return fail(res, '订单不存在或无权查看', 1, 404);
  const doc = await Document.findOne({ where: { id: req.params.docId, orderId: order.id } });
  if (!doc) return fail(res, '单证不存在或无权下载', 1, 404);
  if (!['bl', 'packing_list', 'order'].includes(doc.docType)) {
    return fail(res, '该单证暂不支持门户下载', 1, 400);
  }
  const { pdf } = await printService.render(null, doc.docType, order.id);
  if (!pdf) return fail(res, 'PDF 功能已关闭（服务器低配可选项），请联系管理员开启', 1, 503);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.docType}-${order.id}.pdf"`);
  res.send(pdf);
});

// POST /api/portal/orders/:id/si
// 在线补料（SI）：白名单字段写入订单提单字段，落补料原文/状态/提交人，操作员在订单详情可见
const submitSi = asyncHandler(async (req, res) => {
  const customerId = req.user.customerId;
  if (!customerId) return fail(res, '当前账号未关联客户档案', 1, 400);
  const order = await findOwnOrder(customerId, req.params.id);
  if (!order) return fail(res, '订单不存在或无权查看', 1, 404);
  if (order.status === 'cancelled') return fail(res, '订单已取消，不能提交补料', 1, 409);
  const patch = {};
  for (const [srcKey, orderField] of Object.entries(SI_MAP)) {
    if (req.body[srcKey] !== undefined) patch[orderField] = req.body[srcKey];
  }
  await order.update({
    ...patch,
    siStatus: 'submitted',
    siData: JSON.stringify(req.body),
    siSubmittedAt: new Date(),
    siSubmittedBy: req.user.id,
    siSubmittedByName: req.user.name || '客户',
  });
  ok(res, {
    siStatus: 'submitted',
    submittedAt: order.siSubmittedAt,
    submittedBy: order.siSubmittedByName,
    applied: patch,
  }, '补料已提交');
});

// GET /api/portal/rates?from=&to=&keyword=&containerType=
// 运价查询：复用 FreightRate 检索（有效期过滤 + from→起运港 / to→目的港 + keyword 模糊），只读
// 方案 A：list/compare 为纯参考数据检索，读缓存用较长 TTL + 写事件失效；
// recommend 模式涉及历史成交报价，实时性要求高，不缓存。
const rates = asyncHandler(async (req, res) => {
  const { from, to, keyword } = req.query;
  const containerType = String(req.query.containerType || '').toUpperCase();
  const mode = String(req.query.mode || '').toLowerCase();
  // P2-6 修复：containerType 校验提前到函数入口统一处理（list/compare/recommend 共用），
  // 不再在 readThrough 回调内返回 __error 标记（避免错误对象被缓存、模式不清晰）。
  if (containerType && !['20GP', '40GP', '40HQ'].includes(containerType)) {
    return fail(res, 'containerType 仅支持 20GP/40GP/40HQ', 1, 400);
  }
  // 仅 list/compare 走读缓存；recommend 直接回源
  if (mode !== 'recommend') {
    const seed = ['portal-rate', from || '', to || '', keyword || '', containerType, mode].join('|');
    const data = await readThrough(req, 'rate', seed, config.cache.rateTtl, async () => {
      const where = {};
      if (from) where.originPort = from;
      if (to) where.destPort = to;
      if (containerType) where.containerType = containerType;
      // 有效期过滤：空有效期视为长期有效
      const today = new Date();
      const conds = [
        { [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] },
        { [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: today } }] },
      ];
      if (keyword) {
        conds.push({
          [Op.or]: ['route', 'originPort', 'destPort'].map((f) => ({ [f]: { [Op.like]: `%${keyword}%` } })),
        });
      }
      where[Op.and] = conds;
      const rows = await FreightRate.findAll({
        where,
        order: [['rate', 'ASC']],
        limit: 50,
      });
      // P1 运价比价：mode=compare 时按 承运商+箱型 分组，返回每家最优价并标记全场最低（best）
      if (mode === 'compare') {
        const bestByKey = new Map();
        for (const r of rows) {
          const key = `${r.carrier}#${r.containerType}`;
          if (!bestByKey.has(key)) bestByKey.set(key, r);
        }
        const grouped = [...bestByKey.values()];
        const minByType = new Map();
        for (const r of grouped) {
          const cur = minByType.get(r.containerType);
          if (!cur || Number(r.rate) < Number(cur)) minByType.set(r.containerType, Number(r.rate));
        }
        const list = grouped.map((r) => ({
          ...r.toJSON(),
          best: Number(r.rate) <= (minByType.get(r.containerType) ?? Number.POSITIVE_INFINITY),
        }));
        return { list, total: list.length, mode: 'compare' };
      }
      return { list: rows, total: rows.length, mode: 'list' };
    });
    return ok(res, data);
  }
  // recommend 分支（不缓存，原逻辑）
  const where = {};
  if (from) where.originPort = from;
  if (to) where.destPort = to;
  if (containerType) where.containerType = containerType;
  // 有效期过滤：空有效期视为长期有效
  const today = new Date();
  const conds = [
    { [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] },
    { [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: today } }] },
  ];
  if (keyword) {
    conds.push({
      [Op.or]: ['route', 'originPort', 'destPort'].map((f) => ({ [f]: { [Op.like]: `%${keyword}%` } })),
    });
  }
  where[Op.and] = conds;
  const rows = await FreightRate.findAll({
    where,
    order: [['rate', 'ASC']],
    limit: 50,
  });
  // P2 运价智能推荐：mode=recommend 时结合历史成交报价给出最优建议
  const result = await recommendService({ originPort: from, destPort: to, containerType });
  if (result.error) return fail(res, result.error, 1, 400);
  return ok(res, { ...result, mode: 'recommend' });
});

module.exports = { overview, myOrders, orderDetail, myBills, downloadInvoice, downloadDocument, submitSi, rates };
