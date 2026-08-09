const { CustomField } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedFindOne } = require('../middleware/dataScope');

// B4 自定义字段管理
const list = asyncHandler(async (req, res) => {
  const { bizType } = req.query;
  const where = bizType ? { bizType } : {};
  const rows = await CustomField.findAll({ where, order: [['bizType', 'ASC'], ['sort', 'ASC'], ['id', 'ASC']] });
  ok(res, rows);
});

const create = asyncHandler(async (req, res) => {
  const { bizType, fieldKey, label, fieldType = 'string', options, required = false, isList = false, enabled = true, sort = 10 } = req.body;
  if (!bizType || !fieldKey || !label) return fail(res, 'bizType/fieldKey/label 必填');
  const exists = await CustomField.findOne({ where: { bizType, fieldKey } });
  if (exists) return fail(res, '该业务下字段标识已存在');
  const field = await CustomField.create({
    bizType, fieldKey, label, fieldType, options: options ? JSON.stringify(options) : null,
    required, isList, enabled, sort,
  });
  ok(res, field, '字段已创建');
});

const update = asyncHandler(async (req, res) => {
  const field = await CustomField.findByPk(req.params.id);
  if (!field) return fail(res, '字段不存在', 1, 404);
  const body = { ...req.body };
  delete body.id;
  if (body.options && Array.isArray(body.options)) body.options = JSON.stringify(body.options);
  if (body.options === null) body.options = null;
  await field.update(body);
  ok(res, field, '字段已更新');
});

const remove = asyncHandler(async (req, res) => {
  const field = await CustomField.findByPk(req.params.id);
  if (!field) return fail(res, '字段不存在', 1, 404);
  await field.destroy();
  ok(res, null, '字段已删除');
});

// B4 自定义字段值读写工厂 —— 返回 { getValues, updateValues }
// 用法：const cf = customFieldValues('order', Order); router.get('/orders/:id/custom-fields', cf.getValues);
// bizType 匹配 CustomField.bizType（order/customer/booking/finance）
// B2 数据隔离：读写均按用户可见范围校验目标记录（admin=all 不受限）
function customFieldValues(bizType, model) {
  const getValues = asyncHandler(async (req, res) => {
    const record = await scopedFindOne(req, model, { id: req.params.id });
    if (!record) return fail(res, '记录不存在', 1, 404);
    const defs = await CustomField.findAll({ where: { bizType, enabled: true }, order: [['sort', 'ASC']] });
    let current = {};
    try { current = record.customFields ? JSON.parse(record.customFields) : {}; } catch { /* ignore */ }
    const fields = defs.map((d) => ({
      ...d.toJSON(),
      value: current[d.fieldKey] ?? '',
      options: d.options ? (() => { try { return JSON.parse(d.options); } catch { return []; } })() : [],
    }));
    ok(res, fields);
  });

  const updateValues = asyncHandler(async (req, res) => {
    const record = await scopedFindOne(req, model, { id: req.params.id });
    if (!record) return fail(res, '记录不存在', 1, 404);
    const defs = await CustomField.findAll({ where: { bizType, enabled: true } });
    let current = {};
    try { current = record.customFields ? JSON.parse(record.customFields) : {}; } catch { /* ignore */ }
    const updates = req.body; // { fieldKey: value, ... }
    // 仅保存已定义的字段
    const validKeys = new Set(defs.map((d) => d.fieldKey));
    for (const [k, v] of Object.entries(updates)) {
      if (validKeys.has(k)) current[k] = v;
    }
    await record.update({ customFields: JSON.stringify(current) });
    ok(res, record, '自定义字段已更新');
  });

  return { getValues, updateValues };
}

module.exports = { list, create, update, remove, customFieldValues };