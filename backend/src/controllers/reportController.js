const { ReportDefinition } = require('../models');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { runReport, FIELD_WHITELIST, AGGS } = require('../services/reportService');
const { Op } = require('sequelize');

// GET /reports/meta  前端下拉：数据源、字段白名单、聚合函数、图表类型
const meta = asyncHandler(async (req, res) => {
  ok(res, {
    bizTypes: Object.keys(FIELD_WHITELIST),
    fieldWhitelist: FIELD_WHITELIST,
    aggs: AGGS,
    chartTypes: ['table', 'bar', 'pie', 'line'],
  });
});

// GET /reports?keyword=&enabled=
const list = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const where = {};
  if (req.query.keyword) where.name = { [Op.like]: `%${req.query.keyword}%` };
  const { rows, count } = await ReportDefinition.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// POST /reports
const create = asyncHandler(async (req, res) => {
  const { name, bizType, groupBy, measures, filters, chartType, enabled, remark } = req.body;
  if (!name || !bizType) return fail(res, '报表名称与数据源必填', 1, 400);
  if (!measures || !Array.isArray(measures) || !measures.length) return fail(res, '至少需要一个聚合指标', 1, 400);
  const def = await ReportDefinition.create({
    name, bizType: bizType || 'order',
    groupBy: groupBy || null,
    measures: JSON.stringify(measures),
    filters: filters ? JSON.stringify(filters) : null,
    chartType: chartType || 'table',
    enabled: enabled !== false,
    remark: remark || null,
  });
  ok(res, def, '报表已创建');
});

// PUT /reports/:id
const update = asyncHandler(async (req, res) => {
  const def = await ReportDefinition.findByPk(req.params.id);
  if (!def) return fail(res, '报表不存在', 1, 404);
  const patch = { ...req.body };
  delete patch.id;
  if (patch.measures && typeof patch.measures !== 'string') patch.measures = JSON.stringify(patch.measures);
  if (patch.filters && typeof patch.filters !== 'string') patch.filters = JSON.stringify(patch.filters);
  await def.update(patch);
  ok(res, def, '报表已更新');
});

// DELETE /reports/:id
const remove = asyncHandler(async (req, res) => {
  const def = await ReportDefinition.findByPk(req.params.id);
  if (!def) return fail(res, '报表不存在', 1, 404);
  await def.destroy();
  ok(res, null, '报表已删除');
});

// POST /reports/:id/run  执行报表
const run = asyncHandler(async (req, res) => {
  const def = await ReportDefinition.findByPk(req.params.id);
  if (!def) return fail(res, '报表不存在', 1, 404);
  if (!def.enabled) return fail(res, '报表已停用', 1, 400);
  try {
    const data = await runReport(def);
    ok(res, data);
  } catch (e) {
    fail(res, `报表执行失败: ${e.message}`, 1, 400);
  }
});

module.exports = { meta, list, create, update, remove, run };
