const { Op } = require('sequelize');
const { ok, fail, getPagination, asyncHandler } = require('../utils/response');
const { scopedWhere, scopedFindOne, attachOwnership, hasScopeColumns } = require('../middleware/dataScope');

// 通用 CRUD 控制器工厂
// opts: { model, searchFields, includes, order, codePrefix, codeField, protectedFields, scoped }
// scoped：启用数据隔离（要求模型具备 groupId/ownerId 字段）。list/get 按范围过滤，单条写操作校验可见性，create 自动归属。
// protectedFields：不允许用户通过 create/update/batch-update 写入的系统字段（防越权篡改存储路径等）
function crudController(opts) {
  const { model, searchFields = [], includes = [], order = [['id', 'DESC']], codePrefix, codeField, protectedFields = [], scoped = false } = opts;

  // 剔除受保护字段，防止用户通过请求体篡改存储路径/审计字段等
  function stripProtected(body) {
    const cleaned = { ...body };
    for (const k of protectedFields) delete cleaned[k];
    return cleaned;
  }

  const list = asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = getPagination(req.query);
    const where = {};
    // 精确字段过滤（跳过空值筛选）
    for (const key of Object.keys(req.query)) {
      if (['page', 'pageSize', 'keyword'].includes(key)) continue;
      const val = req.query[key];
      if (val === '' || val === undefined || val === null) continue;
      if (model.rawAttributes[key]) {
        where[key] = val;
      }
    }
    // 关键字模糊搜索
    if (req.query.keyword && searchFields.length) {
      where[Op.or] = searchFields.map((f) => ({ [f]: { [Op.like]: `%${req.query.keyword}%` } }));
    }
    // 数据隔离：列表仅返回用户可见范围
    const finalWhere = scoped ? await scopedWhere(req, where) : where;
    const { rows, count } = await model.findAndCountAll({
      where: finalWhere,
      include: includes,
      order,
      offset,
      limit,
      distinct: true,
    });
    ok(res, { list: rows, total: count, page, pageSize });
  });

  const get = asyncHandler(async (req, res) => {
    const item = scoped
      ? await scopedFindOne(req, model, { id: req.params.id }, includes)
      : await model.findByPk(req.params.id, { include: includes });
    if (!item) return fail(res, '记录不存在', 1, 404);
    ok(res, item);
  });

  const create = asyncHandler(async (req, res) => {
    const body = stripProtected({ ...req.body });
    delete body.id;
    if (codePrefix && codeField && !body[codeField]) {
      const { genCode } = require('../utils/response');
      body[codeField] = genCode(codePrefix);
    }
    // 数据隔离：创建时自动归属（未指定则取用户默认组/本人）
    if (scoped && hasScopeColumns(model)) await attachOwnership(req, body);
    const item = await model.create(body);
    ok(res, item, '创建成功');
  });

  const update = asyncHandler(async (req, res) => {
    const item = scoped
      ? await scopedFindOne(req, model, { id: req.params.id }, includes)
      : await model.findByPk(req.params.id, { include: includes });
    if (!item) return fail(res, '记录不存在', 1, 404);
    const body = stripProtected({ ...req.body });
    delete body.id;
    await item.update(body);
    ok(res, item, '更新成功');
  });

  const remove = asyncHandler(async (req, res) => {
    const item = scoped
      ? await scopedFindOne(req, model, { id: req.params.id }, includes)
      : await model.findByPk(req.params.id, { include: includes });
    if (!item) return fail(res, '记录不存在', 1, 404);
    await item.destroy();
    ok(res, null, '删除成功');
  });

  // 批量删除：POST /:resource/batch-delete { ids: [] }
  const batchRemove = asyncHandler(async (req, res) => {
    const ids = parseIds(req.body.ids);
    if (!ids.length) return fail(res, '请先选择要删除的记录', 1, 400);
    const where = scoped ? await scopedWhere(req, { id: { [Op.in]: ids } }) : { id: { [Op.in]: ids } };
    const count = await model.destroy({ where });
    ok(res, { deleted: count }, `已删除 ${count} 条记录`);
  });

  // 批量更新：POST /:resource/batch-update { ids: [], data: {} }
  // 常用于批量启用/停用、批量改状态等
  const batchUpdate = asyncHandler(async (req, res) => {
    const ids = parseIds(req.body.ids);
    if (!ids.length) return fail(res, '请先选择要更新的记录', 1, 400);
    const data = stripProtected({ ...req.body.data });
    delete data.id;
    const where = scoped ? await scopedWhere(req, { id: { [Op.in]: ids } }) : { id: { [Op.in]: ids } };
    const result = await model.update(data, { where });
    const updated = Array.isArray(result) ? result[0] : result;
    ok(res, { updated }, `已更新 ${updated} 条记录`);
  });

  return { list, get, create, update, remove, batchRemove, batchUpdate };
}

// 解析请求中的 id 数组（兼容字符串/数组/逗号分隔）
function parseIds(input) {
  if (Array.isArray(input)) return input.map((i) => Number(i)).filter((n) => Number.isInteger(n) && n > 0);
  if (typeof input === 'string') return input.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return [];
}

module.exports = { crudController };