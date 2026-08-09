const { BusinessRule } = require('../services/dataAccess');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { executors, FIELD_WHITELIST, runRule, validateBizType } = require('../services/ruleEngineService');
const { Op } = require('sequelize');

// 校验并规范化一条规则：确保 condition 字段在白名单内（防注入），JSON 可解析
function normalizeRule(body) {
  const { name, bizType, ruleType, trigger, condition, params, action, enabled, sortOrder, remark } = body;
  if (!name || !name.trim()) throw new Error('规则名称必填');
  if (!bizType || !ruleType) throw new Error('业务类型与规则类型必填');

  if (ruleType === 'expr') {
    validateBizType(bizType); // 抛错则 bizType 不支持
    if (!condition) throw new Error('表达式规则必须提供 condition');
    const cond = typeof condition === 'string' ? JSON.parse(condition) : condition;
    // 递归校验字段白名单
    const check = (c) => {
      if (!c) return;
      if (c.and && Array.isArray(c.and)) { c.and.forEach(check); return; }
      const { field, op } = c;
      if (!field || !op) throw new Error('表达式缺少 field/op');
      if (!FIELD_WHITELIST[bizType]?.includes(field)) throw new Error(`字段 ${field} 不在白名单内`);
      if (!['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'isNull', 'between'].includes(op)) throw new Error(`运算符 ${op} 不支持`);
    };
    check(cond);
  } else {
    if (!executors[ruleType]) throw new Error(`规则类型 ${ruleType} 未注册`);
  }

  return {
    name: name.trim(),
    bizType,
    ruleType,
    trigger: trigger || 'cron',
    condition: condition ? (typeof condition === 'string' ? condition : JSON.stringify(condition)) : null,
    params: params ? (typeof params === 'string' ? params : JSON.stringify(params)) : null,
    action: action ? (typeof action === 'string' ? action : JSON.stringify(action)) : null,
    enabled: enabled !== false,
    sortOrder: Number(sortOrder || 0),
    remark: remark || null,
  };
}

// GET /business-rules?keyword=&enabled=&page=&pageSize=
const list = asyncHandler(async (req, res) => {
  const { page, pageSize } = getPagination(req.query);
  const where = {};
  if (req.query.keyword) where.name = { [Op.like]: `%${req.query.keyword}%` };
  if (req.query.enabled !== undefined) where.enabled = req.query.enabled === 'true';
  const { rows, count } = await BusinessRule.findAndCountAll({
    where,
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  ok(res, { list: rows, total: count, page, pageSize });
});

// GET /business-rules/meta  前端下拉选项：bizType 清单、ruleType 清单、字段白名单
const meta = asyncHandler(async (req, res) => {
  ok(res, {
    bizTypes: Object.keys(FIELD_WHITELIST),
    ruleTypes: Object.keys(executors),
    fieldWhitelist: FIELD_WHITELIST,
    triggers: ['cron', 'order.created', 'order.updated', 'finance.created', 'finance.updated', 'booking.shipped'],
  });
});

// POST /business-rules
const create = asyncHandler(async (req, res) => {
  try {
    const data = normalizeRule(req.body);
    const rule = await BusinessRule.create(data);
    ok(res, rule, '规则已创建');
  } catch (e) {
    fail(res, e.message, 1, 400);
  }
});

// PUT /business-rules/:id
const update = asyncHandler(async (req, res) => {
  const rule = await BusinessRule.findByPk(req.params.id);
  if (!rule) return fail(res, '规则不存在', 1, 404);
  try {
    const data = normalizeRule({ ...rule.toJSON(), ...req.body });
    await rule.update(data);
    ok(res, rule, '规则已更新');
  } catch (e) {
    fail(res, e.message, 1, 400);
  }
});

// DELETE /business-rules/:id
const remove = asyncHandler(async (req, res) => {
  const rule = await BusinessRule.findByPk(req.params.id);
  if (!rule) return fail(res, '规则不存在', 1, 404);
  await rule.destroy();
  ok(res, null, '规则已删除');
});

// POST /business-rules/:id/test  立即执行一次（不改动规则）
const test = asyncHandler(async (req, res) => {
  const rule = await BusinessRule.findByPk(req.params.id);
  if (!rule) return fail(res, '规则不存在', 1, 404);
  try {
    await runRule(rule);
    ok(res, null, '规则执行完成，请到预警中心查看结果');
  } catch (e) {
    fail(res, `规则执行失败: ${e.message}`, 1, 400);
  }
});

module.exports = { list, meta, create, update, remove, test };
