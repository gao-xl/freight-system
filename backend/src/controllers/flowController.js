const { FlowNode, OrderNode, Order } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedFindOne, scopedWhere } = require('../middleware/dataScope');

// 进出口默认流程模板
const DEFAULT_FLOW = {
  export: [
    { nodeCode: 'booking', nodeName: '订舱', required: true },
    { nodeCode: 'pickup', nodeName: '提空箱', required: false },
    { nodeCode: 'stuffing', nodeName: '装箱/重箱回场', required: false },
    { nodeCode: 'gate_in', nodeName: '进港/运抵', required: true },
    { nodeCode: 'arrival_report', nodeName: '运抵报告', required: true },
    { nodeCode: 'customs', nodeName: '报关', required: true },
    { nodeCode: 'release', nodeName: '海关放行', required: true },
    { nodeCode: 'loading_manifest', nodeName: '装载舱单放行', required: true },
    { nodeCode: 'loaded', nodeName: '装船', required: true },
    { nodeCode: 'departure', nodeName: '离港', required: false },
  ],
  import: [
    { nodeCode: 'manifest', nodeName: '舱单传输', required: true },
    { nodeCode: 'discharge', nodeName: '到港卸船', required: true },
    { nodeCode: 'customs', nodeName: '报关放行', required: true },
    { nodeCode: 'pickup', nodeName: '提箱/拆箱', required: true },
    { nodeCode: 'empty_return', nodeName: '空箱归还', required: false },
    { nodeCode: 'settle', nodeName: '结算', required: false },
  ],
};

// 确保某 bizType 有流程模板（幂等 seed）
async function ensureFlow(bizType) {
  const count = await FlowNode.count({ where: { bizType } });
  if (count > 0) return;
  const nodes = DEFAULT_FLOW[bizType] || [];
  await FlowNode.bulkCreate(nodes.map((n, i) => ({ bizType, sort: i + 1, enabled: true, ...n })));
}

// 流程模板列表（按 bizType 查询）
const listFlowNodes = asyncHandler(async (req, res) => {
  const { bizType } = req.query;
  const where = bizType ? { bizType } : {};
  if (bizType) await ensureFlow(bizType);
  const rows = await FlowNode.findAll({ where, order: [['bizType', 'ASC'], ['sort', 'ASC'], ['id', 'ASC']] });
  ok(res, rows);
});

// 配置节点（启用/必填/排序）
const updateFlowNode = asyncHandler(async (req, res) => {
  const node = await FlowNode.findByPk(req.params.id);
  if (!node) return fail(res, '流程节点不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  await node.update(body);
  ok(res, node, '节点已更新');
});

// 订单节点进度：按 order.type 返回对应模板 + 实例状态
const orderNodes = asyncHandler(async (req, res) => {
  const order = await scopedFindOne(req, Order, { id: req.params.id });
  if (!order) return fail(res, '订单不存在或无权访问', 1, 404);
  const bizType = order.type === 'import' ? 'import' : 'export';
  await ensureFlow(bizType);
  const template = await FlowNode.findAll({ where: { bizType, enabled: true }, order: [['sort', 'ASC'], ['id', 'ASC']] });
  const instances = await OrderNode.findAll({ where: { orderId: order.id } });
  const instByCode = Object.fromEntries(instances.map((n) => [n.nodeCode, n]));
  const nodes = template.map((t) => {
    const inst = instByCode[t.nodeCode];
    return {
      id: t.id,
      bizType: t.bizType,
      nodeCode: t.nodeCode,
      nodeName: t.nodeName,
      required: t.required,
      sort: t.sort,
      status: inst?.status || 'pending',
      doneAt: inst?.doneAt || null,
      remark: inst?.remark || null,
      orderNodeId: inst?.id || null,
    };
  });
  ok(res, { bizType, nodes });
});

// 标记订单节点完成/卡点
const updateOrderNode = asyncHandler(async (req, res) => {
  const { nodeCode } = req.params;
  const { status = 'done', remark } = req.body;
  if (!['done', 'blocked', 'pending'].includes(status)) return fail(res, '非法节点状态');
  const order = await scopedFindOne(req, Order, { id: req.params.id });
  if (!order) return fail(res, '订单不存在或无权访问', 1, 404);
  let inst = await OrderNode.findOne({ where: { orderId: order.id, nodeCode } });
  if (!inst) {
    inst = await OrderNode.create({ orderId: order.id, nodeCode, status, doneAt: status === 'done' ? new Date() : null, remark });
  } else {
    await inst.update({ status, doneAt: status === 'done' ? new Date() : (status === 'pending' ? null : inst.doneAt), remark: remark || inst.remark });
  }
  ok(res, inst, '节点已更新');
});

// 流程统计（进出口维度分布）
const flowStats = asyncHandler(async (req, res) => {
  const [exp, imp] = await Promise.all([
    Order.count({ where: await scopedWhere(req, { type: 'export' }) }),
    Order.count({ where: await scopedWhere(req, { type: 'import' }) }),
  ]);
  ok(res, { export: exp, import: imp, transit: await Order.count({ where: await scopedWhere(req, { type: 'transit' }) }) });
});

module.exports = { listFlowNodes, updateFlowNode, orderNodes, updateOrderNode, flowStats, DEFAULT_FLOW, ensureFlow };