const { Order, Customer, Booking, CustomsDeclaration, ShipmentTrack, FinanceRecord } = require('../models');
const { Op } = require('sequelize');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { exportBuffer } = require('../services/exportService');
const { buildOrderScopeWhere } = require('../middleware/dataScope');
const { checkCustomerCredit } = require('../services/currencyService');
const events = require('../services/eventBus');

// A6 订单业务状态机：按进出口定义业务节点流转
const ORDER_NODES = {
  export: [
    { key: 'booked', label: '订舱' },
    { key: 'gate_in', label: '进港' },
    { key: 'customs', label: '报关' },
    { key: 'loaded', label: '装船' },
    { key: 'arrived', label: '到港' },
    { key: 'cleared', label: '清关' },
    { key: 'delivered', label: '送达' },
  ],
  import: [
    { key: 'booked', label: '订舱' },
    { key: 'arrived', label: '到港' },
    { key: 'customs', label: '报关' },
    { key: 'cleared', label: '清关' },
    { key: 'delivered', label: '送达' },
  ],
};

// 节点 → 运输跟踪阶段映射（用于手动推进）
const NODE_TRACK_STAGE = {
  booked: 'booked',
  gate_in: 'received',
  loaded: 'loaded',
  arrived: 'arrived',
  cleared: 'cleared',
  delivered: 'delivered',
};

// 根据实际业务数据推导已到达的节点集合
function computeReached(order, bookings, customs, tracks) {
  const reached = new Set();
  if (bookings.length) reached.add('booked');
  if (customs.length) reached.add('customs');
  const stages = tracks.map((t) => t.stage);
  if (stages.includes('picked_up') || stages.includes('received')) reached.add('gate_in');
  if (stages.includes('loaded')) reached.add('loaded');
  if (stages.includes('in_transit')) reached.add('loaded');
  if (stages.includes('arrived')) reached.add('arrived');
  if (stages.includes('cleared')) reached.add('cleared');
  if (stages.includes('delivered')) reached.add('delivered');
  // 报关放行视同清关完成（出口）
  if (customs.some((c) => c.status === 'released' || c.status === 'closed')) reached.add('cleared');
  return reached;
}

// 由节点到达情况推导订单状态
function deriveOrderStatus(order, reached, nodes) {
  const keys = nodes.map((n) => n.key);
  const reachedCount = keys.filter((k) => reached.has(k)).length;
  if (order.status === 'cancelled') return 'cancelled';
  if (reachedCount === 0) return 'draft';
  if (reachedCount >= keys.length) return 'completed';
  return 'in_progress';
}

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

// A6 手动推进单个订单节点（供单票/批量共用）
// opts.strict：手动推进开启顺序防呆（不允许跳过/重复推进）；自动化推进传 { strict: false }（业务证据驱动跳进，系统信任）
// D11 修复：整段读-写用事务包裹，杜绝并发覆盖
async function advanceOne(order, node, operatorName, opts = {}) {
  if (!order) return { ok: false, message: '订单不存在' };
  const nodes = ORDER_NODES[order.type] || ORDER_NODES.export;
  const nodeIdx = nodes.findIndex((n) => n.key === node);
  if (nodeIdx === -1) return { ok: false, message: `无效节点：${node}` };

  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const [bookings, customs, tracks] = await Promise.all([
      Booking.findAll({ where: { orderId: order.id }, transaction: t }),
      CustomsDeclaration.findAll({ where: { orderId: order.id }, transaction: t }),
      ShipmentTrack.findAll({ where: { orderId: order.id }, transaction: t }),
    ]);
    const reached = computeReached(order, bookings, customs, tracks);

    // D6 顺序防呆（仅手动推进）：不允许重复推进已到达节点；不允许跳过前置节点直达更远节点
    if (opts.strict !== false) {
      const reachedIdxList = nodes.map((n, i) => (reached.has(n.key) ? i : -1)).filter((i) => i >= 0);
      const lastReachedIdx = reachedIdxList.length ? Math.max(...reachedIdxList) : -1;
      if (reached.has(node)) {
        await t.rollback();
        return { ok: false, message: `节点「${nodes[nodeIdx].label}」已到达，无需重复推进` };
      }
      if (nodeIdx > lastReachedIdx + 1) {
        await t.rollback();
        const prev = nodes[nodeIdx - 1];
        return { ok: false, message: `请先推进到前置节点「${prev.label}」` };
      }
    }

    const stage = NODE_TRACK_STAGE[node];
    if (stage) {
      await ShipmentTrack.create({
        orderId: order.id,
        stage,
        description: `推进至「${nodes[nodeIdx].label}」`,
        location: '',
        eventTime: new Date(),
        operator: operatorName || '',
        auto: true,
      }, { transaction: t });
    }

    const [bookings2, customs2, tracks2] = await Promise.all([
      Booking.findAll({ where: { orderId: order.id }, transaction: t }),
      CustomsDeclaration.findAll({ where: { orderId: order.id }, transaction: t }),
      ShipmentTrack.findAll({ where: { orderId: order.id }, transaction: t }),
    ]);
    const reached2 = computeReached(order, bookings2, customs2, tracks2);
    const derived = deriveOrderStatus(order, reached2, nodes);
    if (derived !== order.status) await order.update({ status: derived }, { transaction: t });
    await t.commit();
    return { ok: true, order: { id: order.id, status: derived }, node, reachedNodes: [...reached2] };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

// A6 手动推进节点：POST /orders/:id/advance { node }
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

function statusMapText(s) {
  return { draft: '草稿', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[s] || s;
}

const base = crudController({
  name: 'order',
  model: Order,
  searchFields: ['orderNo', 'cargoDesc', 'containerNo', 'originPort', 'destPort'],
  codePrefix: 'SO',
  codeField: 'orderNo',
  includes: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  order: [['id', 'DESC']],
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

const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  delete body.id;
  // B2 自动归属：未指定则取用户默认组/本人
  const me = await require('../models').User.findByPk(req.user.id);
  if (!body.groupId) body.groupId = me?.groupId || null;
  if (!body.ownerId) body.ownerId = req.user.id;
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
  const body = { ...req.body };
  delete body.id;
  if (body.customFields && typeof body.customFields !== 'string') body.customFields = JSON.stringify(body.customFields);
  // P3.7 乐观锁：携带 version 时校验，冲突返回 409；不带则兼容旧前端
  if (body.version !== undefined) {
    const clientVersion = Number(body.version);
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
  const [bookings, customs, tracks, finance, documents] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    FinanceRecord.findAll({ where: { orderId: order.id } }),
    require('../models').Document.findAll({ where: { orderId: order.id } }),
  ]);
  ok(res, { order, bookings, customs, tracks, finance, documents });
});

// A4 订单完整时间线：聚合订舱/报关/运输跟踪/财务/单证/放单状态
const timeline = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const [bookings, customs, tracks, finance, releases] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id }, order: [['eventTime', 'ASC']] }),
    FinanceRecord.findAll({ where: { orderId: order.id } }),
    require('../models').ReleaseRecord.findAll({ where: { orderId: order.id } }),
  ]);

  const nodes = [];
  const push = (t, title, desc, at, meta = {}) => nodes.push({ type: t, title, description: desc, time: at, ...meta });

  // 1. 订舱节点
  for (const b of bookings) {
    push('booking', `订舱 ${b.bookingNo}`, `承运人 ${b.supplierId ? '#' + b.supplierId : '-'} · ${b.vesselName || b.flightNo || ''} · ${b.containerType || ''}${b.containerQty ? ' x' + b.containerQty : ''}`, b.bookingDate ? new Date(b.bookingDate + 'T00:00:00') : b.createdAt, { status: b.status });
  }
  // 2. 报关节点
  for (const c of customs) {
    const at = c.submitDate ? new Date(c.submitDate + 'T00:00:00') : c.createdAt;
    push('customs', `报关 ${c.declNo || ''}`, `类型 ${c.type} · 状态 ${c.status}`, at, { status: c.status });
  }
  // 3. 运输跟踪节点（人工+自动）
  for (const t of tracks) {
    push('track', `运输 ${dict(t.stage)}`, [t.description, t.location, t.operator].filter(Boolean).join(' · '), t.eventTime, { stage: t.stage, auto: t.auto });
  }
  // 4. 财务节点
  for (const f of finance) {
    push('finance', `费用 ${f.direction === 'receivable' ? '应收' : '应付'} ${f.amount}`, `${f.description || ''} · 状态 ${f.status}`, f.dueDate ? new Date(f.dueDate + 'T00:00:00') : f.createdAt, { status: f.status, financeId: f.id });
  }
  // 5. 放单节点
  for (const r of releases) {
    push('release', `放单 ${r.status || ''}`, r.remark || '', r.createdAt, { status: r.status });
  }
  // 6. 订单创建/状态节点
  push('order', '订单创建', `${order.orderNo} · ${order.cargoDesc || ''}`, order.createdAt, { status: order.status });

  // 按时间升序排序，无时间靠后
  nodes.sort((a, b) => (a.time ? a.time : 0) - (b.time ? b.time : 0));
  ok(res, { order: { id: order.id, orderNo: order.orderNo, status: order.status }, nodes });
});

function dict(stage) {
  return { booked: '已订舱', picked_up: '已提货', received: '已收货', loaded: '已装船', in_transit: '运输中', arrived: '已到港', cleared: '已清关', delivered: '已送达' }[stage] || stage;
}

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

// 单票成本/毛利（B6）：按订单归集应收(FP)应付(CP)
const profit = asyncHandler(async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id, [
    { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
  ]);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const rows = await FinanceRecord.findAll({ where: { orderId: order.id } });
  let receivable = 0, payable = 0, received = 0, paid = 0;
  const byCategory = {};
  for (const r of rows) {
    // P3.7 本币口径：优先 localAmount（本币折算），缺省回退原币金额（历史数据兼容）
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    const paidAmt = r.localAmount != null ? Number((Number(r.paidAmount || 0) * (r.exchangeRate || 1)).toFixed(2)) : Number(r.paidAmount);
    if (r.direction === 'receivable') { receivable += amt; received += paidAmt; }
    else { payable += amt; paid += paidAmt; }
    const key = r.category;
    byCategory[key] = byCategory[key] || { receivable: 0, payable: 0 };
    if (r.direction === 'receivable') byCategory[key].receivable += amt;
    else byCategory[key].payable += amt;
  }
  const margin = receivable - payable;
  const marginRate = receivable ? (margin / receivable) * 100 : 0;
  ok(res, {
    orderId: order.id, orderNo: order.orderNo, customer: order.customer,
    receivable, payable, received, paid,
    margin, marginRate: Number(marginRate.toFixed(2)),
    receivableBalance: receivable - received, payableBalance: payable - paid,
    byCategory, itemCount: rows.length,
  });
});

// 毛利汇总（按客户/业务员/航线）
const profitSummary = asyncHandler(async (req, res) => {
  const { groupBy = 'customer' } = req.query; // customer | sales | route
  const query = await scopedOrderQuery(req, {
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }],
  });
  const orders = await Order.findAll(query);
  // B2 数据隔离：财务仅统计可见订单，杜绝跨范围泄漏（同时消除全表扫描）
  const orderIds = orders.map((o) => o.id);
  const records = orderIds.length
    ? await FinanceRecord.findAll({
        where: { orderId: { [Op.in]: orderIds } },
        attributes: ['orderId', 'direction', 'amount', 'localAmount', 'exchangeRate'],
      })
    : [];
  const byOrder = {};
  for (const r of records) {
    const oid = r.orderId;
    byOrder[oid] = byOrder[oid] || { receivable: 0, payable: 0 };
    // P3.7 本币口径：localAmount 优先
    const amt = r.localAmount != null ? Number(r.localAmount) : Number(r.amount);
    if (r.direction === 'receivable') byOrder[oid].receivable += amt;
    else byOrder[oid].payable += amt;
  }
  const groups = {};
  for (const o of orders) {
    const g =
      groupBy === 'sales' ? (o.salesId ? `业务员#${o.salesId}` : '未分配') :
      groupBy === 'route' ? `${o.originPort || '?'}→${o.destPort || '?'}` :
      (o.customer?.name || '未知客户');
    groups[g] = groups[g] || { receivable: 0, payable: 0, orderCount: 0 };
    const fin = byOrder[o.id] || { receivable: 0, payable: 0 };
    groups[g].receivable += fin.receivable;
    groups[g].payable += fin.payable;
    groups[g].orderCount += 1;
  }
  const list = Object.entries(groups)
    .map(([name, v]) => ({ name, ...v, margin: v.receivable - v.payable, marginRate: v.receivable ? Number((((v.receivable - v.payable) / v.receivable) * 100).toFixed(2)) : 0 }))
    .sort((a, b) => b.margin - a.margin);
  ok(res, { groupBy, list });
});

module.exports = { ...base, get, list, create, update, detail, timeline, exportExcel, profit, profitSummary, flow, advance, batchAdvance, batchStatus, ORDER_NODES, advanceOne, computeReached };