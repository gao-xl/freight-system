'use strict';

// P3-2 预算管理控制器：编制 / 列表与详情 / 执行分析 / 调整审批
const { ok, fail, asyncHandler } = require('../utils/response');
const svc = require('../services/budgetService');

const list = asyncHandler(async (req, res) => {
  ok(res, await svc.list(req, req.query), '查询成功');
});

const detail = asyncHandler(async (req, res) => {
  ok(res, await svc.get(req, Number(req.params.id)), '查询成功');
});

const create = asyncHandler(async (req, res) => {
  ok(res, await svc.create(req, req.body || {}), '预算已创建');
});

const addLine = asyncHandler(async (req, res) => {
  const r = await svc.addLine(req, Number(req.params.id), req.body || {});
  ok(res, r, '预算明细已添加');
});

const updateLine = asyncHandler(async (req, res) => {
  await svc.updateLine(req, Number(req.params.id), Number(req.params.lineId), req.body || {});
  ok(res, { id: Number(req.params.lineId) }, '预算明细已更新');
});

const removeLine = asyncHandler(async (req, res) => {
  await svc.deleteLine(req, Number(req.params.id), Number(req.params.lineId));
  ok(res, null, '预算明细已删除');
});

// POST /budgets/:id/status?target=approved|closed|draft
const transition = asyncHandler(async (req, res) => {
  ok(res, await svc.transition(req, Number(req.params.id), req.query.target || req.body.target), '状态已更新');
});

const createAdjustment = asyncHandler(async (req, res) => {
  ok(res, await svc.createAdjustment(req, Number(req.params.id), req.body || {}), '调整单已提交，待审批');
});

// POST /budgets/adjustments/:adjId/review?approve=true&rejectReason=xxx
const reviewAdjustment = asyncHandler(async (req, res) => {
  const approve = String(req.query.approve || req.body?.approve) === 'true';
  ok(res, await svc.reviewAdjustment(req, Number(req.params.adjId), approve, req.query.rejectReason || req.body?.rejectReason), approve ? '调整单已批准' : '调整单已驳回');
});

module.exports = { list, detail, create, addLine, updateLine, removeLine, transition, createAdjustment, reviewAdjustment };