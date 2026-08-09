'use strict';

// 财务域应用服务层（架构解耦 F2，2026-08-09）
//
// 职责：财务域自治——本文件是「非 finance 域写 FinanceRecord」的唯一门面。
// 依赖方向：controller / automation / quotation 引用本文件；本文件不反向依赖 controller。
// 来源：services/automationService.js 的 autoCreateReceivable 迁入（打破跨域直写，E6）。

const { Op } = require('sequelize');
const { Order, FinanceRecord } = require('../../models');

// 自动化生成应收的幂等标记（与历史一致：#auto）
const AUTO_MARKER = '#auto';

/**
 * 订单确认/进行中/已完成且有金额 → 自动生成应收财务记录（消除财务双录）
 * 幂等：已存在本自动化生成的应收则跳过；独立容错由调用方（automationService）负责。
 * @returns {Promise<number>} 本次新建应收条数
 */
async function autoCreateReceivable() {
  const orders = await Order.findAll({
    where: {
      status: { [Op.in]: ['confirmed', 'in_progress', 'completed'] },
      totalAmount: { [Op.gt]: 0 },
    },
  });
  let count = 0;
  for (const o of orders) {
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
  }
  return count;
}

/**
 * 财务域唯一写入口门面（E6：跨域写数据收口）
 * 供报价转单等消费方在事务内创建财务记录，避免直连 FinanceRecord。
 * @param {Object} payload FinanceRecord 字段
 * @param {Object} [opts]  { transaction }
 */
async function createRecord(payload, opts = {}) {
  return FinanceRecord.create(payload, opts.transaction ? { transaction: opts.transaction } : undefined);
}

module.exports = { autoCreateReceivable, createRecord, AUTO_MARKER };