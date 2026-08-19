const { OrderContainer, Order } = require('../services/dataAccess');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const events = require('../services/eventBus');
const { validateISO6346 } = require('../utils/containerValidator');
const { scopedFindOne } = require('../middleware/dataScope');

const base = crudController({
  model: OrderContainer,
  searchFields: ['containerNo', 'sealNo'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo', 'cargoDesc'] }],
  order: [['id', 'DESC']],
});

// P0 集装箱越权修复：OrderContainer 无隔离列，所有"按订单"操作先校验订单对当前用户可见，
// 防止持 order 权限的用户读取/覆盖其它小组订单的箱信息。
async function assertOrderVisible(req, orderId) {
  if (orderId == null) return false;
  const order = await scopedFindOne(req, Order, { id: orderId });
  return !!order;
}

// 按订单查询箱列表
const listByOrder = asyncHandler(async (req, res) => {
  // P0 越权修复：确认订单可见后才返回箱列表
  if (!(await assertOrderVisible(req, req.params.orderId))) return fail(res, '订单不存在或无权访问', 1, 404);
  const rows = await OrderContainer.findAll({ where: { orderId: req.params.orderId }, order: [['id', 'ASC']] });
  ok(res, rows);
});

// 批量保存某订单的箱（覆盖式：先删后插，或按 id 更新）
const saveByOrder = asyncHandler(async (req, res) => {
  // P0 越权修复：确认订单可见后才允许覆盖写箱信息与订单 containerNo
  const order = await scopedFindOne(req, Order, { id: req.params.orderId });
  if (!order) return fail(res, '订单不存在或无权访问', 1, 404);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  // ISO 6346 校验
  const invalid = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.containerNo) {
      const result = validateISO6346(it.containerNo);
      if (!result.valid) {
        invalid.push(`第${i + 1}行箱号「${it.containerNo}」: ${result.reason}`);
      }
    }
  }
  if (invalid.length > 0) {
    return fail(res, `箱号校验失败:\n${invalid.join('\n')}`, 1, 422);
  }
  const existing = await OrderContainer.findAll({ where: { orderId: order.id } });
  const existingMap = new Map(existing.map((e) => [e.id, e]));
  const keepIds = [];
  for (const it of items) {
    if (it.id && existingMap.has(it.id)) {
      await existingMap.get(it.id).update({ ...it, orderId: order.id });
      keepIds.push(it.id);
    } else {
      const created = await OrderContainer.create({ ...it, orderId: order.id });
      keepIds.push(created.id);
    }
  }
  // 删除前端未保留的旧行
  for (const e of existing) {
    if (!keepIds.includes(e.id)) await e.destroy();
  }
  // 同步订单总箱号（取第一箱并逗号拼接前若干）
  await order.update({ containerNo: items.map((i) => i.containerNo).filter(Boolean).join(',') || order.containerNo });
  events.emit('container.saved', { orderId: order.id, count: items.length });
  ok(res, items, '箱信息已保存');
});

// 删除单个箱记录：P0 越权修复，校验其关联订单可见后再删除
const remove = asyncHandler(async (req, res) => {
  const item = await OrderContainer.findByPk(req.params.id);
  if (!item) return fail(res, '记录不存在', 1, 404);
  if (!(await assertOrderVisible(req, item.orderId))) return fail(res, '记录不存在或无权访问', 1, 404);
  await item.destroy();
  ok(res, null, '删除成功');
});

module.exports = { ...base, listByOrder, saveByOrder, remove };