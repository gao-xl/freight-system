const { WorkflowConfig } = require('../models');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { transition, STATUS_OPTIONS } = require('../services/workflowService');
const { Op } = require('sequelize');

// 状态选项（前端下拉）
const statusOptions = asyncHandler(async (req, res) => {
  ok(res, STATUS_OPTIONS);
});

// GET /workflow/configs?bizType=&enabled=
const list = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const where = {};
  if (req.query.bizType) where.bizType = req.query.bizType;
  if (req.query.enabled !== undefined) where.enabled = req.query.enabled === 'true';
  const { rows, count } = await WorkflowConfig.findAndCountAll({
    where,
    order: [['bizType', 'ASC'], ['sortOrder', 'ASC'], ['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// POST /workflow/configs
const create = asyncHandler(async (req, res) => {
  const { bizType, fromStatus, toStatus, action, fromRole, auto, enabled, sortOrder, remark } = req.body;
  if (!bizType || !fromStatus || !toStatus) return fail(res, '业务类型、起始状态、目标状态必填', 1, 400);
  if (!STATUS_OPTIONS[bizType]) return fail(res, `不支持的 bizType: ${bizType}`, 1, 400);
  if (fromStatus !== '*' && !STATUS_OPTIONS[bizType].includes(fromStatus)) return fail(res, `起始状态不在 ${bizType} 状态清单内`, 1, 400);
  if (!STATUS_OPTIONS[bizType].includes(toStatus)) return fail(res, `目标状态不在 ${bizType} 状态清单内`, 1, 400);
  const exists = await WorkflowConfig.findOne({ where: { bizType, fromStatus, toStatus } });
  if (exists) return fail(res, '该流转规则已存在', 1, 409);
  const cfg = await WorkflowConfig.create({
    bizType, fromStatus, toStatus, action: action || 'update_status',
    fromRole: fromRole || null, auto: auto === true, enabled: enabled !== false,
    sortOrder: Number(sortOrder || 0), remark: remark || null,
  });
  ok(res, cfg, '流转规则已创建');
});

// PUT /workflow/configs/:id
const update = asyncHandler(async (req, res) => {
  const cfg = await WorkflowConfig.findByPk(req.params.id);
  if (!cfg) return fail(res, '流转规则不存在', 1, 404);
  const patch = { ...req.body };
  delete patch.id;
  await cfg.update(patch);
  ok(res, cfg, '流转规则已更新');
});

// DELETE /workflow/configs/:id
const remove = asyncHandler(async (req, res) => {
  const cfg = await WorkflowConfig.findByPk(req.params.id);
  if (!cfg) return fail(res, '流转规则不存在', 1, 404);
  await cfg.destroy();
  ok(res, null, '流转规则已删除');
});

// POST /workflow/transition  统一流转入口：{ bizType, id, toStatus }
const doTransition = asyncHandler(async (req, res) => {
  const { bizType, id, toStatus, fromStatus } = req.body;
  if (!bizType || !id || !toStatus) return fail(res, 'bizType/id/toStatus 必填', 1, 400);
  const result = await transition({ bizType, id, toStatus, fromStatus, ctx: { user: req.user } });
  if (!result.ok) return fail(res, result.message, result.code || 400, result.code === 404 ? 404 : 400);
  ok(res, result.data, result.message);
});

module.exports = { list, create, update, remove, doTransition, statusOptions };
