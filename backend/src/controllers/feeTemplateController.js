// N1 费用模板控制器：常用费用组合（多行费用一键套用）
const { FeeTemplate } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const { scopedWhere, scopedFindOne, attachOwnership } = require('../middleware/dataScope');

const base = crudController({
  name: 'fee-template',
  model: FeeTemplate,
  searchFields: ['name'],
  order: [['id', 'DESC']],
  scoped: true,
});

// 校验 items 结构（方向/类别/金额/币种），返回规范化数组
function normalizeItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .filter((i) => i && i.description || i.amount != null)
    .map((i) => ({
      direction: ['receivable', 'payable'].includes(i.direction) ? i.direction : 'receivable',
      category: i.category || 'other',
      description: String(i.description || '').slice(0, 255),
      amount: Number(i.amount) || 0,
      currency: String(i.currency || 'USD').toUpperCase().slice(0, 10),
    }))
    .filter((i) => i.amount > 0);
}

// 创建/更新前规范化 items
async function beforeWrite(req, item, body) {
  if (body && body.items !== undefined) {
    body.items = JSON.stringify(normalizeItems(body.items));
  }
}

// 覆写 create/update 走 beforeWrite 规范化
const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  await beforeWrite(req, null, body);
  // P1 修复：创建归属由服务端解析，不信任客户端传入的 groupId
  await attachOwnership(req, body);
  const item = await FeeTemplate.create(body);
  ok(res, item, '费用模板已创建');
});

const update = asyncHandler(async (req, res) => {
  const tpl = await scopedFindOne(req, FeeTemplate, { id: req.params.id });
  if (!tpl) return fail(res, '模板不存在或无权访问', 1, 404);
  const body = { ...req.body };
  await beforeWrite(req, tpl, body);
  await tpl.update(body);
  ok(res, tpl, '费用模板已更新');
});

// 获取模板明细（items 解析为数组）
const get = asyncHandler(async (req, res) => {
  const where = await scopedWhere(req, { id: req.params.id });
  const tpl = await FeeTemplate.findOne({ where });
  if (!tpl) return fail(res, '模板不存在', 1, 404);
  const j = tpl.toJSON();
  try { j.items = JSON.parse(j.items || '[]'); } catch { j.items = []; }
  ok(res, j);
});

module.exports = { ...base, create, update, get };
