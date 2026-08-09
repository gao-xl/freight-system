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

/**
 * —— 读门面（E6 对称收口：跨域读也统一经 finance 域，避免散落直查 FinanceRecord）——
 * 以下方法供「非 finance 域」读取财务数据；finance 域内部（controller/statement）仍可直接用模型。
 */

// 按订单读取费用记录（面向订单详情/打印/账期守卫等跨域读）
function findRecordsByOrderId(orderId, opts = {}) {
  return FinanceRecord.findAll({ where: { orderId }, ...opts });
}

// 按多订单批量读取（面向对账单/报表聚合）
function findRecordsByOrderIds(orderIds, opts = {}) {
  if (!Array.isArray(orderIds) || !orderIds.length) return Promise.resolve([]);
  return FinanceRecord.findAll({ where: { orderId: { [Op.in]: orderIds } }, ...opts });
}

// 超期应收（已过到期日且未收清）——面向预警/规则引擎
function findOverdueReceivable(now = new Date()) {
  return FinanceRecord.findAll({
    where: { direction: 'receivable', status: { [Op.in]: ['unpaid', 'partial'] }, dueDate: { [Op.lt]: now } },
    include: [{ model: Order, as: 'order', attributes: ['orderNo'] }],
  });
}

// 幂等/归属校验用的单条查询
function findRecord(where, opts = {}) {
  return FinanceRecord.findOne({ where, ...opts });
}

// 统计（面向演示数据/仪表盘数）
function countRecords(where = {}) {
  return FinanceRecord.count({ where });
}

// 按账期读取费用记录（面向结账/对账；periodRange 由调用方换算为起止 Date）
function findRecordsInPeriod(start, end) {
  return FinanceRecord.findAll({
    where: {
      [Op.and]: [
        {
          [Op.or]: [
            { settleMonth: { [Op.gte]: start, [Op.lt]: end } },
            { settleMonth: null, createdAt: { [Op.gte]: start, [Op.lt]: end } },
          ],
        },
      ],
    },
  });
}

// 按维度读取费用记录（面向多币种汇总/信用额度等聚合读；where 已含数据隔离约束）
function findRecordsForAggregation(where, opts = {}) {
  return FinanceRecord.findAll({ where, ...opts });
}

module.exports = {
  autoCreateReceivable,
  createRecord,
  AUTO_MARKER,
  // 读门面
  findRecordsByOrderId,
  findRecordsByOrderIds,
  findOverdueReceivable,
  findRecord,
  countRecords,
  findRecordsInPeriod,
  findRecordsForAggregation,
};