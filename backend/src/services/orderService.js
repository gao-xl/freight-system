'use strict';

// 订单域应用服务层（架构解耦 F1，2026-08-09）
//
// 职责：事务外壳 + 用例编排（advanceOne 等）；纯业务逻辑保持在 domains/order/orderDomain.js。
// 依赖方向：controller / automation 引用本文件；本文件只依赖 domain 与 models，不反向依赖 controller。
// 来源：controllers/orderController.js 的 advanceOne 事务外壳迁入（打破 controller↔service 耦合）。

const { Booking, CustomsDeclaration, ShipmentTrack } = require('../models');
const { ORDER_NODES, NODE_TRACK_STAGE, computeReached, deriveOrderStatus } = require('../domains/order/orderDomain');

// 手动推进单个订单节点（供单票/批量共用）
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

module.exports = { advanceOne, computeReached };