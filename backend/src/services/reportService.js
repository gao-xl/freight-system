'use strict';

// P3.3 自定义报表执行引擎
// 报表 = 数据源(bizType) + 分组(groupBy) + 聚合指标(measures) + 过滤(filters) + 图表类型
// 安全约束：分组字段、聚合字段、过滤字段全部走白名单，禁止任意字段（与规则引擎一致）。
// 执行：Sequelize findAll + attributes([fn(agg, field), alias]) + group + where，无 eval。

const { Op } = require('sequelize');
const { Order, FinanceRecord, Customer } = require('../models');

// 数据源映射
const MODEL_MAP = { order: Order, finance: FinanceRecord, customer: Customer };

// 各数据源字段白名单（分组/聚合/过滤均限这些字段）
const FIELD_WHITELIST = {
  order: ['id', 'orderNo', 'status', 'type', 'customerId', 'salesId', 'totalAmount', 'currency', 'createdAt', 'eta'],
  finance: ['id', 'direction', 'status', 'category', 'amount', 'localAmount', 'currency', 'orderId', 'customerId', 'createdAt', 'dueDate'],
  customer: ['id', 'name', 'level', 'ownerId', 'createdAt'],
};

// 允许的聚合函数
const AGGS = ['sum', 'count', 'avg', 'min', 'max'];

function getModel(bizType) {
  const Model = MODEL_MAP[bizType];
  if (!Model) throw new Error(`不支持的报表数据源: ${bizType}`);
  return Model;
}

function assertField(bizType, field, label) {
  if (!FIELD_WHITELIST[bizType]?.includes(field)) {
    throw new Error(`${label} 字段不在白名单内: ${field}`);
  }
}

// 过滤条件 → Sequelize where（与规则引擎 buildWhere 同构，字段走白名单）
function buildWhere(bizType, filters) {
  if (!Array.isArray(filters) || !filters.length) return {};
  const out = {};
  for (const f of filters) {
    const { field, op, value } = f;
    if (!field || !op) throw new Error('过滤条件缺少 field/op');
    assertField(bizType, field, '过滤');
    switch (op) {
      case 'eq': out[field] = value; break;
      case 'ne': out[field] = { [Op.ne]: value }; break;
      case 'gt': out[field] = { [Op.gt]: value }; break;
      case 'gte': out[field] = { [Op.gte]: value }; break;
      case 'lt': out[field] = { [Op.lt]: value }; break;
      case 'lte': out[field] = { [Op.lte]: value }; break;
      case 'contains': out[field] = { [Op.like]: `%${value}%` }; break;
      case 'in': out[field] = { [Op.in]: Array.isArray(value) ? value : String(value).split(',') }; break;
      case 'isNull': out[field] = { [Op.is]: null }; break;
      default: throw new Error(`不支持的过滤运算符: ${op}`);
    }
  }
  return out;
}

/**
 * 执行报表
 * @param {Object} def 报表定义（含 bizType/groupBy/measures/filters）
 * @returns {Promise<{columns: string[], rows: Array, groupBy: string|null}>}
 */
async function runReport(def) {
  const bizType = def.bizType;
  const Model = getModel(bizType);
  const measures = Array.isArray(def.measures) ? def.measures : (def.measures ? JSON.parse(def.measures) : []);

  if (!measures.length) throw new Error('报表至少需要一个聚合指标');

  // 1. 校验聚合指标
  for (const m of measures) {
    if (!m.field || !m.agg) throw new Error('聚合指标缺少 field/agg');
    if (!AGGS.includes(m.agg)) throw new Error(`不支持的聚合函数: ${m.agg}`);
    assertField(bizType, m.field, '聚合');
  }

  // 2. 构建 attributes
  const attributes = measures.map((m) => [
    Model.sequelize.fn(m.agg === 'count' ? 'COUNT' : m.agg.toUpperCase(), Model.sequelize.col(m.field)),
    m.alias || `${m.agg}_${m.field}`,
  ]);

  // 3. 分组
  let group = null;
  if (def.groupBy) {
    assertField(bizType, def.groupBy, '分组');
    group = [def.groupBy];
    attributes.unshift([def.groupBy, 'groupKey']);
  }

  // 4. 过滤 + 排序
  const where = buildWhere(bizType, def.filters || []);
  const order = def.groupBy ? [[Model.sequelize.col('groupKey'), 'ASC']] : [];

  // 5. 执行
  const rows = await Model.findAll({ attributes, where, group, order, raw: true, limit: 500 });

  return {
    bizType,
    groupBy: def.groupBy || null,
    columns: attributes.map(([, alias]) => alias),
    measures: measures.map((m) => m.alias || `${m.agg}_${m.field}`),
    rows,
    chartType: def.chartType || 'table',
  };
}

module.exports = { runReport, MODEL_MAP, FIELD_WHITELIST, AGGS, getModel };
