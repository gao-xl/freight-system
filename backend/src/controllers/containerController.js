const { OrderContainer, Order } = require('../models');
const { crudController } = require('./baseController');
const { ok, fail, asyncHandler } = require('../utils/response');
const events = require('../services/eventBus');

const base = crudController({
  model: OrderContainer,
  searchFields: ['containerNo', 'sealNo'],
  includes: [{ model: Order, as: 'order', attributes: ['id', 'orderNo', 'cargoDesc'] }],
  order: [['id', 'DESC']],
});

// 按订单查询箱列表
const listByOrder = asyncHandler(async (req, res) => {
  const rows = await OrderContainer.findAll({ where: { orderId: req.params.orderId }, order: [['id', 'ASC']] });
  ok(res, rows);
});

// 批量保存某订单的箱（覆盖式：先删后插，或按 id 更新）
const saveByOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.orderId);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
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

module.exports = { ...base, listByOrder, saveByOrder };