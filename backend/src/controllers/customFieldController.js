const { CustomField } = require('../models');
const { ok, fail, asyncHandler } = require('../utils/response');

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

module.exports = { list, create, update, remove };