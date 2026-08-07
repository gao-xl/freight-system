// 青岛港专项业务服务
// 负责出口 7 节点看板、节点更新、装载舱单检查与预警计算。
// 遵循"先手动录入 + 规则推导保证可用，再接入场站/EDI 自动喂数"原则。
const { Op } = require('sequelize');
const { QingdaoNode, Order, Booking, CustomsDeclaration } = require('../models');

// 青岛港出口节点顺序（看板渲染与预警计算共用）
const NODE_SEQ = [
  { node: 'picked_up', label: '提箱' },
  { node: 'loaded', label: '装箱/回场' },
  { node: 'arrived_port', label: '进港/集港' },
  { node: 'manifest_report', label: '运抵报告' },
  { node: 'customs_release', label: '海关放行' },
  { node: 'loading_manifest', label: '装载舱单' },
  { node: 'loaded_on_board', label: '装船' },
  { node: 'departed', label: '离港' },
];
const NODE_SET = NODE_SEQ.map((n) => n.node);

// 导出节点清单（供前端渲染）
function checklist() {
  return NODE_SEQ.map((n, i) => ({ ...n, seq: i + 1 }));
}

// 获取某订单 7 节点看板
async function getNodeBoard(orderId) {
  const order = await Order.findByPk(orderId, {
    include: [{ model: QingdaoNode, as: 'qingdaoNodes' }],
  });
  if (!order) throw { status: 404, message: '订单不存在' };

  const nodeMap = new Map((order.qingdaoNodes || []).map((n) => [n.node, n]));
  const nodes = NODE_SEQ.map(({ node, label }) => {
    const rec = nodeMap.get(node);
    return {
      node,
      label,
      status: rec ? rec.status : 'pending',
      eventTime: rec ? rec.eventTime : null,
      detail: rec ? rec.detail : null,
      source: rec ? rec.source : null,
      operator: rec ? rec.operator : null,
    };
  });
  const doneCount = nodes.filter((n) => n.status === 'done').length;
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    containerNo: order.containerNo,
    terminal: order.terminal,
    openTime: order.openTime,
    cutoffTime: order.cutoffTime,
    progress: nodes.length ? Math.round((doneCount / nodes.length) * 100) : 0,
    nodes,
  };
}

// 更新单个节点（upsert），支持手动/自动喂数
async function updateNode(orderId, node, data = {}) {
  const { status, eventTime, detail, source, operator, bookingId } = data;
  if (!NODE_SET.includes(node)) throw { status: 400, message: `非法节点: ${node}` };
  const order = await Order.findByPk(orderId);
  if (!order) throw { status: 404, message: '订单不存在' };

  const [rec] = await QingdaoNode.upsert({
    orderId,
    bookingId: bookingId || null,
    node,
    status: status || 'done',
    eventTime: eventTime || new Date(),
    detail: detail || null,
    source: source || 'manual',
    operator: operator || null,
  });
  return rec;
}

// 装载舱单检查：新舱单制度下判断"是否可以装船"
async function checkManifest(bookingId) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw { status: 404, message: '订舱单不存在' };
  const order = await Order.findByPk(booking.orderId);
  const customs = await CustomsDeclaration.findOne({
    where: { orderId: booking.orderId },
    order: [['id', 'DESC']],
  });
  const nodes = await QingdaoNode.findAll({ where: { orderId: booking.orderId } });
  const nodeMap = new Map(nodes.map((n) => [n.node, n.status]));

  const checks = [];
  // 1. 报关是否放行
  const cRelease = nodeMap.get('customs_release') === 'done' || customs?.status === 'released';
  checks.push({ item: '报关单放行', ok: cRelease, level: cRelease ? 'done' : 'blocked', message: cRelease ? '报关已放行' : '报关未放行，无法装船' });
  // 2. 预配舱单是否放行
  const premani = nodeMap.get('manifest_report') === 'done';
  checks.push({ item: '预配舱单放行（运抵报告）', ok: premani, level: premani ? 'done' : 'blocked', message: premani ? '运抵报告已生成' : '运抵报告未生成' });
  // 3. 装载舱单是否已发送
  const lmani = nodeMap.get('loading_manifest') === 'done';
  checks.push({ item: '装载舱单发送', ok: lmani, level: lmani ? 'done' : 'warning', message: lmani ? '装载舱单已发送' : '装载舱单未发送' });
  // 4. 是否已装船
  const boarded = nodeMap.get('loaded_on_board') === 'done';
  checks.push({ item: '装船', ok: boarded, level: boarded ? 'done' : 'warning', message: boarded ? '已装船' : '尚未装船' });

  const blocked = checks.some((c) => c.level === 'blocked');
  const warning = !blocked && checks.some((c) => c.level === 'warning');
  return {
    bookingId,
    orderId: booking.orderId,
    orderNo: order?.orderNo,
    canLoad: !blocked,
    result: blocked ? 'blocked' : warning ? 'warning' : 'ready',
    checks,
  };
}

// 预警计算：遍历在途订单，按规则命中预警
async function calcAlerts() {
  const orders = await Order.findAll({
    where: { status: { [Op.in]: ['confirmed', 'in_progress'] } },
    include: [{ model: QingdaoNode, as: 'qingdaoNodes' }],
  });
  const alerts = [];
  const now = new Date();

  for (const order of orders) {
    const nodeMap = new Map((order.qingdaoNodes || []).map((n) => [n.node, n.status]));
    const st = (node) => nodeMap.get(node) || 'pending';
    const push = (rule, level, dueAt, message) =>
      alerts.push({
        orderId: order.id,
        orderNo: order.orderNo,
        containerNo: order.containerNo,
        terminal: order.terminal,
        rule,
        level,
        dueAt: dueAt || null,
        message,
      });

    // 规则1：未进港且临近截港（now > cutoffTime - 6h）
    if (order.cutoffTime && st('arrived_port') !== 'done') {
      const cutoff = new Date(order.cutoffTime);
      if (now > new Date(cutoff.getTime() - 6 * 3600 * 1000)) {
        push('未进港临近截港', 'warning', cutoff, `截港 ${order.cutoffTime} 临近，货物尚未进港`);
      }
    }
    // 规则2：已进港未运抵（超 2h）
    if (st('arrived_port') === 'done' && st('manifest_report') !== 'done') {
      push('已进港未运抵', 'warning', null, '货物已进港，运抵报告尚未生成');
    }
    // 规则3：已运抵未放行（超 2h）
    if (st('manifest_report') === 'done' && st('customs_release') !== 'done') {
      push('已运抵未放行', 'warning', null, '运抵已生成，海关尚未放行');
    }
    // 规则4：放行未确认装载舱单
    if (st('customs_release') === 'done' && st('loading_manifest') !== 'done') {
      push('装载舱单未确认', 'warning', null, '海关已放行，装载舱单尚未确认/发送');
    }
    // 规则5：报关或舱单卡点 blocked
    if (st('customs_release') === 'blocked' || st('loading_manifest') === 'blocked') {
      push('报关/舱单卡点', 'blocked', null, '存在报关或装载舱单卡点，需人工处理');
    }
  }
  return alerts;
}

module.exports = { NODE_SEQ, checklist, getNodeBoard, updateNode, checkManifest, calcAlerts };