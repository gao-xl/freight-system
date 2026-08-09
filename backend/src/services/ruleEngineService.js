'use strict';

// P3.1 业务规则引擎（DB 化）
// ---------------------------------------------------------------
// 两种规则：
//  ① 内置类型规则：ruleType 指向本文件 executors 注册表的执行器（如 eta_soon）
//  ② 通用表达式规则：ruleType='expr'，condition 里 field/op/value 白名单评估
//
// 安全约束（禁 eval）：
//  - 字段白名单 FIELD_WHITELIST：仅允许对已登记字段做条件判断
//  - 操作符白名单 OPS：仅 eq/ne/gt/gte/lt/lte/contains/in/isNull/between
//  - 值类型由操作符校验，一律不拼接成代码执行
//
// 触发：trigger='cron' 随 runAllRules 定时扫描；trigger=事件名（order.created 等）事件驱动。
//       事件驱动的规则由事件系统调用 runDbRules({ trigger: 'order.created' }) 过滤执行。

const { Op } = require('sequelize');
const { Order, Booking, CustomsDeclaration, FinanceRecord, Customer, AlertRecord, BusinessRule } = require('../models');
const { logger } = require('../utils/logger');

// ── 字段白名单：bizType → 可参与条件判断的字段（防注入） ──
const FIELD_WHITELIST = {
  order: ['id', 'orderNo', 'status', 'eta', 'cutoffTime', 'totalAmount', 'currency', 'customerId', 'ownerId', 'groupId', 'createdAt'],
  finance: ['id', 'direction', 'status', 'amount', 'currency', 'dueDate', 'paidAmount', 'orderId', 'ownerId', 'groupId', 'createdAt'],
  booking: ['id', 'status', 'vessel', 'voyage', 'etd', 'eta', 'orderId', 'ownerId', 'createdAt'],
  customs: ['id', 'status', 'declNo', 'customsNo', 'orderId', 'createdAt'],
  customer: ['id', 'name', 'level', 'ownerId', 'createdAt'],
};

// bizType → Sequelize 模型
const MODEL_MAP = {
  order: Order,
  finance: FinanceRecord,
  booking: Booking,
  customs: CustomsDeclaration,
  customer: Customer,
};

// ── 操作符白名单 ──
function buildOpValue(op, value, field) {
  switch (op) {
    case 'eq': return { [field]: value };
    case 'ne': return { [field]: { [Op.ne]: value } };
    case 'gt': return { [field]: { [Op.gt]: value } };
    case 'gte': return { [field]: { [Op.gte]: value } };
    case 'lt': return { [field]: { [Op.lt]: value } };
    case 'lte': return { [field]: { [Op.lte]: value } };
    case 'contains': return { [field]: { [Op.like]: `%${value}%` } };
    case 'in': return { [field]: { [Op.in]: Array.isArray(value) ? value : String(value).split(',') } };
    case 'isNull': return { [field]: { [Op.is]: null } };
    case 'between': {
      const [a, b] = Array.isArray(value) ? value : String(value).split(',');
      return { [field]: { [Op.between]: [new Date(a), new Date(b)] } };
    }
    default: throw new Error(`不支持的运算符: ${op}`);
  }
}

// 表达式求值：{ field, op, value } 或 { and: [ ... ] }
function buildWhere(condition) {
  if (!condition) return {};
  if (condition.and && Array.isArray(condition.and)) {
    return { [Op.and]: condition.and.map((c) => buildWhere(c)) };
  }
  const { field, op, value } = condition;
  if (!field || !op) throw new Error('表达式缺少 field/op');
  return buildOpValue(op, value, field);
}

function validateBizType(bizType) {
  if (!MODEL_MAP[bizType]) throw new Error(`不支持的 bizType: ${bizType}`);
}

// 写入预警（复用 alertService 的幂等逻辑，避免循环依赖）
// E2：仅在"新建"时发射 alert.created 事件（通知推送服务订阅；重复命中不重复推送）
async function upsertAlert(alert) {
  const existing = await AlertRecord.findOne({ where: { dedupKey: alert.dedupKey } });
  if (existing) {
    await existing.update({ level: alert.level, title: alert.title, message: alert.message, dueAt: alert.dueAt, status: 'active' });
    return existing;
  }
  const created = await AlertRecord.create({ ...alert, status: 'active' });
  try {
    require('./eventBus').emit('alert.created', {
      alertId: created.id,
      type: created.type,
      level: created.level,
      orderId: created.orderId,
      bookingId: created.bookingId,
      financeId: created.financeId,
      title: created.title,
      message: created.message,
      dedupKey: created.dedupKey,
      dueAt: created.dueAt,
    });
  } catch (e) {
    // 事件发射失败不影响预警落库
  }
  return created;
}

// ── 内置执行器注册表（ruleType → 执行函数） ──
// 执行器签名：async (rule, params) => void；params 来自 rule.params JSON
const executors = {
  // 订单金额超阈值：params { threshold: 100000, currency: 'USD'? }
  order_amount_over: async (rule, params) => {
    const threshold = Number(params.threshold || 0);
    const rows = await Order.findAll({ where: { status: { [Op.notIn]: ['cancelled', 'completed'] } } });
    for (const o of rows) {
      const amt = Number(o.totalAmount || 0);
      if (amt > threshold) {
        await emitFromRule(rule, o, {
          orderId: o.id,
          level: 'danger',
          title: '订单金额超限',
          message: `订单 ${o.orderNo} 金额 ${amt} 超过阈值 ${threshold}`,
          dueAt: o.eta || new Date(),
          dedupKey: `${rule.id || rule.name}:amount_over:${o.id}`,
        });
      }
    }
  },
  // 订单 ETA 临近（参数化）：params { days: 7 }
  eta_soon: async (rule, params) => {
    const days = Number(params.days || 7);
    const now = new Date();
    const soon = new Date(now.getTime() + days * 24 * 3600 * 1000);
    const rows = await Order.findAll({ where: { eta: { [Op.between]: [now, soon] }, status: { [Op.in]: ['confirmed', 'in_progress'] } } });
    for (const o of rows) {
      const left = Math.ceil((new Date(o.eta) - now) / (24 * 3600 * 1000));
      await emitFromRule(rule, o, {
        orderId: o.id,
        level: left <= 2 ? 'danger' : 'warning',
        title: 'ETA 临近',
        message: `订单 ${o.orderNo} 预计 ${left} 天后到港（${o.eta}）`,
        dueAt: o.eta,
        dedupKey: `eta_soon:${o.id}:${o.eta}`,
      });
    }
  },
  // 超期应收（参数化）：params { overdueDays: 30 }
  overdue_receivable: async (rule, params) => {
    const overdueDays = Number(params.overdueDays || 30);
    const now = new Date();
    const rows = await FinanceRecord.findAll({
      where: { direction: 'receivable', status: { [Op.in]: ['unpaid', 'partial'] }, dueDate: { [Op.lt]: now } },
      include: [{ model: Order, as: 'order', attributes: ['orderNo'] }],
    });
    for (const r of rows) {
      const days = Math.floor((now - new Date(r.dueDate)) / (24 * 3600 * 1000));
      const remain = Number(r.amount) - Number(r.paidAmount || 0);
      await emitFromRule(rule, r, {
        orderId: r.orderId,
        financeId: r.id,
        level: days >= overdueDays ? 'danger' : 'warning',
        title: '超期应收',
        message: `${r.order?.orderNo || '订单'} 应收 ${r.currency} ${remain} 已逾期 ${days} 天`,
        dueAt: r.dueDate,
        dedupKey: `overdue_receivable:${r.id}`,
      });
    }
  },
};

// 按规则配置产出预警：action JSON 可覆盖 level/title/message；支持 {field} 模板替换
async function emitFromRule(rule, row, defaults) {
  let action = {};
  try { action = rule.action ? JSON.parse(rule.action) : {}; } catch { /* 忽略非法 JSON */ }
  const safe = (s) => {
    if (!s) return s;
    return String(s).replace(/\{(\w+)\}/g, (_, k) => (row && row[k] != null ? String(row[k]) : `{${k}}`));
  };
  await upsertAlert({
    type: action.type || 'business_rule',
    level: action.level || defaults.level || 'warning',
    orderId: defaults.orderId,
    bookingId: defaults.bookingId,
    financeId: defaults.financeId,
    title: safe(action.title || defaults.title || rule.name),
    message: safe(action.message || defaults.message || rule.name),
    dueAt: defaults.dueAt,
    dedupKey: action.dedupKey || defaults.dedupKey || `${rule.id || rule.name}:${row.id}`,
  });
}

// 执行一条规则
async function runRule(rule) {
  const bizType = rule.bizType;
  const params = rule.params ? JSON.parse(rule.params) : {};
  if (rule.ruleType === 'expr') {
    // 通用表达式：白名单字段评估
    validateBizType(bizType);
    const condition = rule.condition ? JSON.parse(rule.condition) : {};
    const where = buildWhere(condition);
    const Model = MODEL_MAP[bizType];
    const rows = await Model.findAll({ where });
    for (const row of rows) {
      await emitFromRule(rule, row, {
        orderId: bizType === 'order' ? row.id : row.orderId || undefined,
        financeId: bizType === 'finance' ? row.id : undefined,
        level: 'warning',
        title: rule.name,
        message: `${rule.name}: ${row.orderNo || row.description || row.name || row.id}`,
        dueAt: row.eta || row.dueDate || new Date(),
        dedupKey: `rule:${rule.id}:${row.id}`,
      });
    }
    return;
  }
  const fn = executors[rule.ruleType];
  if (!fn) throw new Error(`未注册的规则类型: ${rule.ruleType}`);
  await fn(rule, params);
}

// 运行全部启用规则（按 trigger 过滤；默认只跑 cron 规则，事件规则由事件系统按事件名调用）
async function runDbRules({ trigger = 'cron' } = {}) {
  const rules = await BusinessRule.findAll({ where: { enabled: true }, order: [['sortOrder', 'ASC']] });
  const matched = rules.filter((r) => (r.trigger || 'cron') === trigger);
  for (const rule of matched) {
    try {
      await runRule(rule);
    } catch (e) {
      logger.error(`[RULE] 规则 ${rule.name} 执行失败`, { message: e.message });
    }
  }
  return matched.length;
}

module.exports = { runDbRules, runRule, executors, FIELD_WHITELIST, MODEL_MAP, validateBizType, buildWhere };
