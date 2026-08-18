const { Order, Customer, Booking, CustomsDeclaration, ShipmentTrack } = require('../services/dataAccess');
const { Op } = require('sequelize');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { exportBuffer } = require('../services/exportService');
const { buildOrderScopeWhere, attachOwnership } = require('../middleware/dataScope');
const { checkCustomerCredit } = require('../services/currencyService');
const events = require('../services/eventBus');
const { ORDER_NODES, computeReached, deriveOrderStatus, statusMapText, dict } = require('../domains/order/orderDomain');
const { advanceOne } = require('../services/orderService');
const finance = require('../domains/finance/financeService');

// 订单状态机纯逻辑已迁至 domains/order/orderDomain.js（F0），advanceOne 事务外壳已迁至 services/orderService.js（F1）。
// 本文件只保留 HTTP 编排与数据权限编排。

// A6 订单流转查询：GET /orders/:id/flow
const flow = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const nodes = ORDER_NODES[order.type] || ORDER_NODES.export;
  const [bookings, customs, tracks] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id } }),
  ]);
  const reached = computeReached(order, bookings, customs, tracks);
  const lastReachedIdx = Math.max(-1, ...nodes.map((n, i) => (reached.has(n.key) ? i : -1)));
  const list = nodes.map((n, i) => ({
    ...n,
    index: i,
    reached: reached.has(n.key),
    current: i === lastReachedIdx,
  }));
  const currentIndex = Math.min(nodes.filter((n) => reached.has(n.key)).length, nodes.length); // 下一个待推进节点下标
  const derivedStatus = deriveOrderStatus(order, reached, nodes);
  ok(res, {
    order: { id: order.id, orderNo: order.orderNo, type: order.type, status: order.status },
    nodes: list,
    currentIndex: Math.min(currentIndex, nodes.length),
    reachedCount: nodes.filter((n) => reached.has(n.key)).length,
    total: nodes.length,
    derivedStatus,
    statusChanged: derivedStatus !== order.status,
  });
});

// A6 手动推进单个节点（事务外壳已迁至 orderService；此处仅做 HTTP 编排）
const advance = asyncHandler(async (req, res) => {
  const { node } = req.body;
  const order = await findVisibleOrder(req, req.params.id);
  const result = await advanceOne(order, node, req.user?.name || '');
  if (!result.ok) return fail(res, result.message, 1004, order ? 400 : 404);
  ok(res, result, '节点已推进');
});

// 批量推进节点：POST /orders/batch-advance { ids: [], node }
const batchAdvance = asyncHandler(async (req, res) => {
  const { node, ids } = req.body;
  if (!node) return fail(res, '请指定要推进的节点', 1, 400);
  const idList = (Array.isArray(ids) ? ids : String(ids || '').split(',')).map(Number).filter((n) => n > 0);
  if (!idList.length) return fail(res, '请先选择要批量推进的订单', 1, 400);
  const batchWhere = await buildOrderScopeWhere(req, { id: { [Op.in]: idList } });
  const orders = await Order.findAll({ where: batchWhere });
  const okList = [], failedList = [];
  for (const o of orders) {
    const r = await advanceOne(o, node, req.user?.name || '');
    if (r.ok) okList.push(r.order.id); else failedList.push({ id: o.id, orderNo: o.orderNo, message: r.message });
  }
  ok(res, { ok: okList.length, failed: failedList.length, failedList, node }, `已推进 ${okList.length} 张订单${failedList.length ? `，失败 ${failedList.length} 张` : ''}`);
});

// 批量修改订单状态：POST /orders/batch-status { ids: [], status }
// U3+U8 修复：订单状态是派生的（computeReached/deriveOrderStatus），不允许无脑覆盖。
// 收敛为两条语义：
//  - completed：要求所有业务节点已到达，否则逐单给出未到达节点（与 advanceOne 校验一致）
//  - cancelled：允许直接设置（业务取消，无"取消"节点可推进）
//  - draft/confirmed/in_progress：派生状态，拒绝直接覆盖，提示走"推进节点"
const batchStatus = asyncHandler(async (req, res) => {
  const { status, ids } = req.body;
  const valid = ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'];
  if (!valid.includes(status)) return fail(res, `无效状态：${status}`, 1, 400);
  if (status !== 'completed' && status !== 'cancelled') {
    return fail(res, `「${statusMapText(status)}」为系统派生的流转状态，请使用"推进节点"操作推进业务节点`, 1, 400);
  }
  const idList = (Array.isArray(ids) ? ids : String(ids || '').split(',')).map(Number).filter((n) => n > 0);
  if (!idList.length) return fail(res, '请先选择要批量更新的订单', 1, 400);
  const batchWhere = await buildOrderScopeWhere(req, { id: { [Op.in]: idList } });
  const orders = await Order.findAll({ where: batchWhere });
  const okList = [], failedList = [];

  for (const o of orders) {
    if (status === 'cancelled') {
      if (o.status === 'cancelled') { failedList.push({ id: o.id, orderNo: o.orderNo, message: '订单已是取消状态' }); continue; }
      await o.update({ status: 'cancelled' });
      okList.push(o.id);
      continue;
    }
    // completed：校验所有业务节点已到达（复用状态机判定，与 advanceOne 同源）
    const nodes = ORDER_NODES[o.type] || ORDER_NODES.export;
    const [bookings, customs, tracks] = await Promise.all([
      Booking.findAll({ where: { orderId: o.id } }),
      CustomsDeclaration.findAll({ where: { orderId: o.id } }),
      ShipmentTrack.findAll({ where: { orderId: o.id } }),
    ]);
    const reached = computeReached(o, bookings, customs, tracks);
    const missing = nodes.filter((n) => !reached.has(n.key)).map((n) => n.label);
    if (missing.length) {
      failedList.push({ id: o.id, orderNo: o.orderNo, message: `业务节点未到齐，缺少：${missing.join('、')}` });
      continue;
    }
    if (o.status === 'completed') { failedList.push({ id: o.id, orderNo: o.orderNo, message: '订单已是完成状态' }); continue; }
    await o.update({ status: 'completed' });
    okList.push(o.id);
  }

  ok(res, { ok: okList.length, failed: failedList.length, failedList, status },
    `已更新 ${okList.length} 张订单${failedList.length ? `，失败 ${failedList.length} 张` : ''}`);
});

const base = crudController({
  name: 'order',
  model: Order,
  searchFields: ['orderNo', 'cargoDesc', 'containerNo', 'originPort', 'destPort'],
  codePrefix: 'SO',
  codeField: 'orderNo',
  includes: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  order: [['id', 'DESC']],
  // B2 数据隔离修复：此前未开启 scoped，导致 base 提供的 remove/batchRemove/batchUpdate/restore
  // 四个写操作不叠加数据范围约束，跨组用户可删除/批量删除/批量更新/恢复他人订单，绕过隔离。
  // 开启后这些操作自动经 scopedFindOne/scopedWhere 校验可见性（get/list 已自行覆盖不受影响）。
  scoped: true,
});

// B2 数据权限：按用户可见范围取单个订单；无权限返回 null（admin=all 不受限）
async function findVisibleOrder(req, id, include) {
  const where = await buildOrderScopeWhere(req, { id });
  return Order.findOne({ where, include });
}
// B2 数据权限：在已有 where 上叠加可见范围
async function scopedOrderQuery(req, query) {
  const where = await buildOrderScopeWhere(req, query.where || {});
  return { ...query, where };
}

// B2 数据权限：订单单条读取（覆盖 base.get）
const get = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id, [
    { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
  ]);
  if (!order) return fail(res, '订单不存在', 1, 404);
  ok(res, order);
});

// 构造列表筛选条件（U2 修复：list 与 exportExcel 共用，保证导出=所见）
// 支持：keyword（模糊搜索）、status/mode/type 等模型字段精确过滤（跳过空值）
// U5 修复：deleted=1 时查看回收站（仅已删除订单）
function buildListWhere(req) {
  const baseWhere = {};
  for (const key of Object.keys(req.query)) {
    if (['page', 'pageSize', 'keyword', 'deleted'].includes(key)) continue;
    const val = req.query[key];
    if (val === '' || val === undefined || val === null) continue;
    if (Order.rawAttributes[key]) baseWhere[key] = val;
  }
  if (req.query.deleted === '1' && Order.rawAttributes.deletedAt) {
    baseWhere.deletedAt = { [Op.ne]: null };
  }
  if (req.query.keyword) {
    baseWhere[Op.or] = ['orderNo', 'cargoDesc', 'containerNo', 'originPort', 'destPort'].map((f) => ({
      [f]: { [Op.like]: `%${req.query.keyword}%` },
    }));
  }
  return baseWhere;
}

// B2 数据权限：订单列表按 dataScope 过滤 + 创建时自动归属
const list = asyncHandler(async (req, res) => {
  const { getPagination } = require('../utils/response');
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const trashView = req.query.deleted === '1' && Order.rawAttributes.deletedAt;
  const where = await buildOrderScopeWhere(req, buildListWhere(req));
  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
    order: [['id', 'DESC']],
    offset,
    limit,
    distinct: true,
    paranoid: trashView ? false : undefined, // U5：回收站视图需越过软删过滤
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// ── 越权防护：订单字段白名单 ──
// 受保护字段一律禁止客户端直接赋值（归属/Audit 字段、状态机字段、系统派生字段）。
// 仅保留存在于 Order 模型列、且非受保护字段，避免大规模属性赋值（Mass Assignment）。
const PROTECTED_CREATE = new Set([
  'id', 'groupId', 'ownerId', 'version', 'isDemo', 'releaseStatus', 'siStatus',
  'siSubmittedAt', 'siSubmittedBy', 'siSubmittedByName', 'createdAt', 'updatedAt', 'deletedAt',
]);
const PROTECTED_UPDATE = new Set([
  'id', 'orderNo', 'customerId', 'type', 'status', 'releaseStatus', 'groupId', 'ownerId', 'version', 'isDemo',
  'siStatus', 'siSubmittedAt', 'siSubmittedBy', 'siSubmittedByName', 'createdAt', 'updatedAt', 'deletedAt',
]);
function pickOrderFields(body, protectedSet) {
  const cols = Order.rawAttributes || {};
  const out = {};
  for (const k of Object.keys(body || {})) {
    if (protectedSet.has(k)) continue;
    if (!(k in cols)) continue;
    out[k] = body[k];
  }
  return out;
}

const create = asyncHandler(async (req, res) => {
  const body = pickOrderFields(req.body, PROTECTED_CREATE);
  // 归属以服务端解析的用户默认组/本人为准，不信任客户端传入的 groupId/ownerId
  await attachOwnership(req, body);
  body.orderNo = body.orderNo || require('../utils/response').genCode('SO');
  if (body.customFields && typeof body.customFields !== 'string') body.customFields = JSON.stringify(body.customFields);
  // B6 信用额度校验：客户未收已超限时拦截（除非显式 forceCredit=1）
  if (body.customerId && !req.body.forceCredit) {
    const credit = await checkCustomerCredit(body.customerId, body.currency || 'CNY');
    if (!credit.ok) {
      return fail(res, `${credit.message}，如需继续请勾选“强制下单”`, 2001, 400);
    }
  }
  const item = await Order.create(body);
  events.emit('order.created', { orderId: item.id, orderNo: item.orderNo, customerId: item.customerId, type: item.type });
  ok(res, item, '创建成功');
});

const update = asyncHandler(async (req, res) => {
  const item = await findVisibleOrder(req, req.params.id);
  if (!item) return fail(res, '订单不存在', 1, 404);
  // 受保护字段（归属/状态机/单号/客户归属等）不允许在此直接修改，交由专门流程/接口处理
  const body = pickOrderFields(req.body || {}, PROTECTED_UPDATE);
  if (body.customFields && typeof body.customFields !== 'string') body.customFields = JSON.stringify(body.customFields);
  // P3.7 乐观锁：携带 version 时校验，冲突返回 409；不带则兼容旧前端
  if (req.body.version !== undefined) {
    const clientVersion = Number(req.body.version);
    const currentVersion = Number(item.version || 0);
    if (clientVersion !== currentVersion) {
      return fail(res, '数据已被他人修改，请刷新后重试', 409, 409);
    }
    body.version = currentVersion + 1;
  }
  await item.update(body);
  events.emit('order.updated', { orderId: item.id, orderNo: item.orderNo });
  ok(res, item, '更新成功');
});

// 订单详情（含订舱、报关、单证、跟踪、财务）
const detail = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id, [
    { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
  ]);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const [bookings, customs, tracks, financeData, documents] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    finance.findRecordsByOrderId(order.id),
    require('../services/dataAccess').Document.findAll({ where: { orderId: order.id } }),
  ]);
  ok(res, { order, bookings, customs, tracks, finance: financeData, documents });
});

// A4 订单完整时间线：聚合订舱/报关/运输跟踪/财务/单证/放单状态
const timeline = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const [bookings, customs, tracks, financeData, releases] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    finance.findRecordsByOrderId(order.id),
    require('../services/dataAccess').ReleaseRecord.findAll({ where: { orderId: order.id } }),
  ]);

  const nodes = [];
  const push = (t, title, desc, at, meta = {}) => nodes.push({ type: t, title, description: desc, time: at, ...meta });

  // 风险判定：为节点补充 riskLevel（normal/warning/danger），供前端时间线异常标红
  // 规则映射基于各节点状态枚举，仅对"业务受阻/超期/待处理"状态标记风险
  const riskLevelFor = (type, meta) => {
    switch (type) {
      case 'booking':
        // new=待确认(关注), cancelled=取消(异常)
        if (meta.status === 'cancelled') return 'danger';
        if (meta.status === 'new') return 'warning';
        return 'normal';
      case 'customs':
        // 未放行/被驳回/查验中=异常；released/closed 正常
        if (meta.status === 'rejected') return 'danger';
        if (['prepared', 'submitted', 'inspecting'].includes(meta.status)) return 'warning';
        return 'normal';
      case 'finance': {
        // 应收未收且已超期=异常；unpaid/partial 未超期=关注
        if (meta.status === 'unpaid' || meta.status === 'partial') {
          if (meta.dueDate && new Date(meta.dueDate + 'T00:00:00') < new Date()) return 'danger';
          return 'warning';
        }
        return 'normal';
      }
      case 'release':
        // 待审批=异常(需处理)；approved/rejected 正常
        if (meta.status === 'pending') return 'danger';
        return 'normal';
      case 'track':
      case 'order':
      default:
        return 'normal';
    }
  };

  // 1. 订舱节点
  for (const b of bookings) {
    const meta = { status: b.status };
    push('booking', `订舱 ${b.bookingNo}`, `承运人 ${b.supplierId ? '#' + b.supplierId : '-'} · ${b.vesselName || b.flightNo || ''} · ${b.containerType || ''}${b.containerQty ? ' x' + b.containerQty : ''}`, b.bookingDate ? new Date(b.bookingDate + 'T00:00:00') : b.createdAt, { ...meta, riskLevel: riskLevelFor('booking', meta) });
  }
  // 2. 报关节点
  for (const c of customs) {
    const at = c.submitDate ? new Date(c.submitDate + 'T00:00:00') : c.createdAt;
    const meta = { status: c.status };
    push('customs', `报关 ${c.declNo || ''}`, `类型 ${c.type} · 状态 ${c.status}`, at, { ...meta, riskLevel: riskLevelFor('customs', meta) });
  }
  // 3. 运输跟踪节点（人工+自动）
  for (const t of tracks) {
    push('track', `运输 ${dict(t.stage)}`, [t.description, t.location, t.operator].filter(Boolean).join(' · '), t.eventTime, { stage: t.stage, auto: t.auto, riskLevel: 'normal' });
  }
  // 4. 财务节点
  for (const f of financeData) {
    const meta = { status: f.status, financeId: f.id, dueDate: f.dueDate };
    push('finance', `费用 ${f.direction === 'receivable' ? '应收' : '应付'} ${f.amount}`, `${f.description || ''} · 状态 ${f.status}`, f.dueDate ? new Date(f.dueDate + 'T00:00:00') : f.createdAt, { ...meta, riskLevel: riskLevelFor('finance', meta) });
  }
  // 5. 放单节点
  for (const r of releases) {
    const meta = { status: r.approvalStatus || r.status };
    push('release', `放单 ${meta.status || ''}`, r.remark || '', r.createdAt, { ...meta, riskLevel: riskLevelFor('release', meta) });
  }
  // 6. 订单创建/状态节点
  push('order', '订单创建', `${order.orderNo} · ${order.cargoDesc || ''}`, order.createdAt, { status: order.status, riskLevel: 'normal' });

  // 按时间升序排序，无时间靠后
  nodes.sort((a, b) => (a.time ? a.time : 0) - (b.time ? b.time : 0));
  ok(res, { order: { id: order.id, orderNo: order.orderNo, status: order.status }, nodes });
});

// Excel 导出订单列表（U2 修复：复用 list 的筛选条件，导出=所见，不再全量导出）
const exportExcel = asyncHandler(async (req, res) => {
  const trashView = req.query.deleted === '1' && Order.rawAttributes.deletedAt;
  const finalWhere = await buildOrderScopeWhere(req, buildListWhere(req));
  const rows = await Order.findAll({
    where: finalWhere,
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
    order: [['id', 'DESC']],
    paranoid: trashView ? false : undefined,
  });
  const statusMap = { draft: '草稿', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' };
  const data = rows.map((r) => ({
    orderNo: r.orderNo,
    客户: r.customer?.name || '',
    进出口: r.type === 'import' ? '进口' : '出口',
    运输方式: { sea: '海运', air: '空运', land: '陆运', rail: '铁路' }[r.mode] || r.mode,
    起运港: r.originPort,
    目的港: r.destPort,
    货描: r.cargoDesc,
    件数: r.packageCount,
    重量t: Number(r.cargoWeight),
    箱号: r.containerNo,
    预计发运: r.etd,
    预计到港: r.eta,
    金额: Number(r.totalAmount),
    币种: r.currency,
    状态: statusMap[r.status] || r.status,
  }));
  const buf = await exportBuffer(
    data,
    [
      { header: '订单号', key: 'orderNo', width: 18 },
      { header: '客户', key: '客户', width: 24 },
      { header: '进出口', key: '进出口', width: 8 },
      { header: '运输方式', key: '运输方式', width: 10 },
      { header: '起运港', key: '起运港', width: 14 },
      { header: '目的港', key: '目的港', width: 14 },
      { header: '货描', key: '货描', width: 20 },
      { header: '件数', key: '件数', width: 8 },
      { header: '重量(t)', key: '重量t', width: 10 },
      { header: '箱号', key: '箱号', width: 16 },
      { header: '预计发运', key: '预计发运', width: 12 },
      { header: '预计到港', key: '预计到港', width: 12 },
      { header: '金额', key: '金额', width: 12 },
      { header: '币种', key: '币种', width: 8 },
      { header: '状态', key: '状态', width: 10 },
    ],
    '订单列表'
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.xlsx"');
  res.send(Buffer.from(buf));
});

// 单票成本/毛利（B6）：按订单归集应收(FP)应付(CP)；聚合逻辑在 financeService.summarizeOrderMargin
const profit = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id, [
    { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
  ]);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const rows = await finance.findRecordsByOrderId(order.id);
  const marginData = finance.summarizeOrderMargin(rows);
  ok(res, {
    orderId: order.id, orderNo: order.orderNo, customer: order.customer,
    ...marginData,
  });
});

// 毛利汇总（按客户/业务员/航线）；聚合逻辑在 financeService.summarizeProfitGroups
const profitSummary = asyncHandler(async (req, res) => {
  const { groupBy = 'customer' } = req.query; // customer | sales | route
  const query = await scopedOrderQuery(req, {
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  });
  const orders = await Order.findAll(query);
  // B2 数据隔离：财务仅统计可见订单，杜绝跨范围泄漏（同时消除全表扫描）
  const orderIds = orders.map((o) => o.id);
  const records = orderIds.length
    ? await finance.findRecordsByOrderIds(orderIds, { attributes: ['orderId', 'direction', 'amount', 'localAmount', 'exchangeRate'] })
    : [];
  const list = finance.summarizeProfitGroups(orders, records, groupBy);
  ok(res, { groupBy, list });
});

module.exports = { ...base, get, list, create, update, detail, timeline, exportExcel, profit, profitSummary, flow, advance, batchAdvance, batchStatus, ORDER_NODES };