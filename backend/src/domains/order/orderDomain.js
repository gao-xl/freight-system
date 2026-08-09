'use strict';

// 订单域纯逻辑层（domains/order）
//
// 来源：controllers/orderController.js 状态机纯函数迁移（2026-08-09，架构解耦重构 F0）
// 铁律（架构解耦方案 §4.3）：本文件为纯函数层——
//   - 禁止 require models / 禁止依赖 req/res / 禁止任何 IO
//   - 依赖方向：controller/application 引用本文件，本文件不得反向引用任何层
// 事务外壳与用例编排留在 orderService（F1 落位），advanceOne 的读-算部分留待 F1 纯化。

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

// 订单状态中文映射（派生状态文案）
function statusMapText(s) {
  return { draft: '草稿', confirmed: '已确认', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[s] || s;
}

// 运输跟踪阶段中文映射
function dict(stage) {
  return { booked: '已订舱', picked_up: '已提货', received: '已收货', loaded: '已装船', in_transit: '运输中', arrived: '已到港', cleared: '已清关', delivered: '已送达' }[stage] || stage;
}

module.exports = { ORDER_NODES, NODE_TRACK_STAGE, computeReached, deriveOrderStatus, statusMapText, dict };
