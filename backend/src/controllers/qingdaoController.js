// 青岛港专项控制器
// 多为聚合/计算接口，不套用通用 CRUD，独立实现。
const { ok, fail, asyncHandler } = require('../utils/response');
const svc = require('../services/qingdaoService');

// GET /qingdao/nodes?orderId=1  某订单 7 节点看板
const nodes = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.query.orderId, 10);
  if (!orderId) return fail(res, '缺少 orderId 参数', 1, 400);
  const data = await svc.getNodeBoard(orderId);
  ok(res, data);
});

// POST /qingdao/nodes  手动更新节点 { orderId, node, status, eventTime, detail }
const updateNode = asyncHandler(async (req, res) => {
  const { orderId, node } = req.body;
  if (!orderId || !node) return fail(res, '缺少 orderId 或 node', 1, 400);
  const rec = await svc.updateNode(orderId, node, {
    ...req.body,
    operator: req.body.operator || req.user?.username,
  });
  ok(res, rec, '节点已更新');
});

// GET /qingdao/checklist  7 节点清单与顺序
const checklist = asyncHandler(async (req, res) => {
  ok(res, svc.checklist());
});

// GET /qingdao/alerts?terminal=QQCT  预警列表
const alerts = asyncHandler(async (req, res) => {
  let list = await svc.calcAlerts();
  if (req.query.terminal) {
    list = list.filter((a) => a.terminal === req.query.terminal);
  }
  ok(res, list);
});

// GET /qingdao/manifest/check?bookingId=1  装载舱单检查
const manifestCheck = asyncHandler(async (req, res) => {
  const bookingId = parseInt(req.query.bookingId || req.query.orderId, 10);
  if (!bookingId) return fail(res, '缺少 bookingId 参数', 1, 400);
  const data = await svc.checkManifest(bookingId);
  ok(res, data);
});

module.exports = { nodes, updateNode, checklist, alerts, manifestCheck };