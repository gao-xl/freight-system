// P1 发票号段管理控制器（admin，system 模块）
const { NumberSegment } = require('../services/dataAccess');
const { ok, fail, asyncHandler } = require('../utils/response');
const { Op } = require('sequelize');
const { getScope } = require('../middleware/dataScope');

const BIZ_TYPES = ['invoice_ar', 'invoice_ap'];

// P1 修复：号段归属校验。NumberSegment 仅有 groupId（无 ownerId 列），
// 故不用 scopedFindOne（其 self 分支会引用不存在的 ownerId 列），改为显式小组可见性判断。
async function visibleSegment(req, id) {
  const seg = await NumberSegment.findByPk(id);
  if (!seg) return null;
  const { scope, groupIds } = await getScope(req);
  if (scope === 'all') return seg;
  if (!seg.groupId || (groupIds && groupIds.includes(Number(seg.groupId)))) return seg;
  return null;
}

async function resolveGroupId(req, requested) {
  if (requested == null || requested === '') return null;
  const n = Number(requested);
  if (!Number.isInteger(n)) return null;
  const { scope, groupIds } = await getScope(req);
  if (scope === 'all' || (groupIds && groupIds.includes(n))) return n;
  return null;
}

// 列表：GET /number-segments?bizType=
const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.bizType) {
    if (!BIZ_TYPES.includes(req.query.bizType)) return fail(res, 'bizType 仅支持 invoice_ar/invoice_ap', 1, 400);
    where.bizType = req.query.bizType;
  }
  const { scope, groupIds } = await getScope(req);
  if (scope !== 'all') {
    where[Op.or] = [{ groupId: null }, { groupId: { [Op.in]: groupIds || [] } }];
  }
  const rows = await NumberSegment.findAll({ where, order: [['bizType', 'ASC'], ['id', 'ASC']] });
  ok(res, rows);
});

// 创建号段：POST /number-segments
const create = asyncHandler(async (req, res) => {
  const { bizType, prefix, startSeq = 1, endSeq = 0, digit = 8, enabled = true, remark } = req.body;
  if (!BIZ_TYPES.includes(bizType)) return fail(res, 'bizType 仅支持 invoice_ar/invoice_ap', 1, 400);
  if (!prefix) return fail(res, '请填写号段前缀', 1, 400);
  if (!Number.isInteger(Number(digit)) || Number(digit) < 4 || Number(digit) > 12) {
    return fail(res, 'digit（序号位数）需在 4~12 之间', 1, 400);
  }
  const exists = await NumberSegment.findOne({ where: { bizType, prefix } });
  if (exists) return fail(res, '该 bizType+prefix 号段已存在', 1, 400);
  // P1 修复：groupId 归属经服务端可看作集合校验，越界小组则落空，不信任客户端直写
  const groupId = await resolveGroupId(req, req.body.groupId);
  const seg = await NumberSegment.create({
    bizType, prefix, startSeq: Number(startSeq), endSeq: Number(endSeq),
    digit: Number(digit), enabled: !!enabled, remark,
    currentSeq: Math.max(0, Number(startSeq) - 1), groupId,
  });
  ok(res, seg, '号段已创建');
});

// 更新号段：PUT /number-segments/:id
const update = asyncHandler(async (req, res) => {
  const seg = await visibleSegment(req, req.params.id);
  if (!seg) return fail(res, '号段不存在或无权访问', 1, 404);
  const { prefix, endSeq, digit, enabled, remark, groupId, currentSeq } = req.body;
  if (prefix !== undefined && prefix !== seg.prefix) {
    const clash = await NumberSegment.findOne({ where: { bizType: seg.bizType, prefix, id: { [Op.ne]: seg.id } } });
    if (clash) return fail(res, '该 bizType+prefix 号段已存在', 1, 400);
    seg.prefix = prefix;
  }
  if (digit !== undefined && (Number(digit) < 4 || Number(digit) > 12)) return fail(res, '序号位数需在 4~12 之间', 1, 400);
  if (endSeq !== undefined) seg.endSeq = Number(endSeq);
  if (digit !== undefined) seg.digit = Number(digit);
  if (enabled !== undefined) seg.enabled = !!enabled;
  if (remark !== undefined) seg.remark = remark;
  if (groupId !== undefined) seg.groupId = await resolveGroupId(req, groupId);
  if (currentSeq !== undefined) seg.currentSeq = Number(currentSeq);
  await seg.save();
  ok(res, seg, '号段已更新');
});

// 删除号段：DELETE /number-segments/:id
const remove = asyncHandler(async (req, res) => {
  const seg = await visibleSegment(req, req.params.id);
  if (!seg) return fail(res, '号段不存在或无权访问', 1, 404);
  await seg.destroy();
  ok(res, null, '号段已删除');
});

module.exports = { BIZ_TYPES, list, create, update, remove };