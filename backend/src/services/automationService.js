const { Op } = require('sequelize');
const {
  Order, Booking, CustomsDeclaration, ShipmentTrack, FinanceRecord, AuditLog,
} = require('../models');
const { advanceOne, computeReached } = require('../controllers/orderController');
const { logger } = require('../utils/logger');

// 自动化动作引擎：把"检测→报警"的规则引擎升级为"检测→自动执行动作"。
// 设计约束：
//  - 幂等：每个动作在执行前都先判断目标状态是否已满足，避免每次定时扫描重复执行。
//  - 独立容错：单个动作失败不影响其他动作（与 alertService.runAllRules 一致）。
//  - 可审计：每个动作写入 AuditLog（username=SYSTEM），可追溯"什么被自动做了"。
//  - 零迁移：复用现有表；财务幂等以 description 中的 #auto 标记区分（后续建议加 source 列）。

const AUTO_MARKER = '#auto';
const OPERATOR = 'SYSTEM(自动化)';

// 审计留痕
async function logAudit(action, targetId, summary) {
  try {
    await AuditLog.create({
      username: 'SYSTEM',
      module: 'automation',
      action,
      method: 'AUTO',
      targetId: String(targetId),
      summary,
    });
  } catch (e) {
    logger.error('[AUTOMATION] 审计写入失败', { message: e.message });
  }
}

// 取订单当前已到达节点集合（复用 orderController 的 computeReached，单一事实来源）
async function reachedOf(order) {
  const [bookings, customs, tracks] = await Promise.all([
    Booking.findAll({ where: { orderId: order.id } }),
    CustomsDeclaration.findAll({ where: { orderId: order.id } }),
    ShipmentTrack.findAll({ where: { orderId: order.id } }),
  ]);
  return computeReached(order, bookings, customs, tracks);
}

// 动作1：订舱已装船/已发船 → 自动推进订单至「装船」节点
async function autoAdvanceFromBooking() {
  const bookings = await Booking.findAll({
    where: { status: { [Op.in]: ['loading', 'shipped'] } },
  });
  let count = 0;
  for (const b of bookings) {
    const order = await Order.findByPk(b.orderId);
    if (!order || order.status === 'cancelled') continue;
    const reached = await reachedOf(order);
    if (reached.has('loaded')) continue; // 已到达则跳过（幂等）
    const r = await advanceOne(order, 'loaded', OPERATOR);
    if (r.ok) {
      count += 1;
      await logAudit('auto_advance', order.id, `订舱${b.bookingNo}已装船/发船，自动推进至「装船」节点`);
    }
  }
  return count;
}

// 动作2：报关已放行 → 自动推进订单至「清关」节点
async function autoAdvanceFromCustoms() {
  const customs = await CustomsDeclaration.findAll({
    where: { status: { [Op.in]: ['released', 'closed'] } },
  });
  let count = 0;
  for (const c of customs) {
    const order = await Order.findByPk(c.orderId);
    if (!order || order.status === 'cancelled') continue;
    const reached = await reachedOf(order);
    if (reached.has('cleared')) continue; // 已到达则跳过（幂等）
    const r = await advanceOne(order, 'cleared', OPERATOR);
    if (r.ok) {
      count += 1;
      await logAudit('auto_advance', order.id, `报关${c.customsNo || c.id}已放行，自动推进至「清关」节点`);
    }
  }
  return count;
}

// 动作3：订单已确认且有金额 → 自动生成应收财务记录（消除财务双录）
async function autoCreateReceivable() {
  const orders = await Order.findAll({
    where: {
      status: { [Op.in]: ['confirmed', 'in_progress', 'completed'] },
      totalAmount: { [Op.gt]: 0 },
    },
  });
  let count = 0;
  for (const o of orders) {
    // 幂等：已存在本自动化生成的应收则跳过
    const exist = await FinanceRecord.findOne({
      where: { orderId: o.id, direction: 'receivable', description: { [Op.like]: `%${AUTO_MARKER}%` } },
    });
    if (exist) continue;
    const due = o.eta ? new Date(new Date(o.eta).getTime() + 30 * 24 * 3600 * 1000) : null;
    await FinanceRecord.create({
      orderId: o.id,
      counterpartyId: o.customerId,
      direction: 'receivable',
      category: 'ocean_freight',
      description: `订单${o.orderNo}确认自动生成应收 ${AUTO_MARKER}`,
      amount: o.totalAmount,
      currency: o.currency || 'USD',
      status: 'unpaid',
      dueDate: due ? due.toISOString().slice(0, 10) : null,
    });
    count += 1;
    await logAudit('auto_finance', o.id, `订单${o.orderNo}确认，自动生成应收 ${o.currency || 'USD'} ${o.totalAmount}`);
  }
  return count;
}

// 执行全部自动化动作
async function runAutomations() {
  const t0 = Date.now();
  const result = { advanced: 0, financeCreated: 0, errors: [] };
  try {
    result.advanced += await autoAdvanceFromBooking();
  } catch (e) {
    result.errors.push(`booking: ${e.message}`);
    logger.error('[AUTOMATION] 订舱推进失败', { message: e.message });
  }
  try {
    result.advanced += await autoAdvanceFromCustoms();
  } catch (e) {
    result.errors.push(`customs: ${e.message}`);
    logger.error('[AUTOMATION] 报关推进失败', { message: e.message });
  }
  try {
    result.financeCreated += await autoCreateReceivable();
  } catch (e) {
    result.errors.push(`finance: ${e.message}`);
    logger.error('[AUTOMATION] 应收生成失败', { message: e.message });
  }
  logger.info(`[AUTOMATION] 执行完成，耗时 ${Date.now() - t0}ms`, result);
  return result;
}

module.exports = {
  runAutomations,
  autoAdvanceFromBooking,
  autoAdvanceFromCustoms,
  autoCreateReceivable,
};
