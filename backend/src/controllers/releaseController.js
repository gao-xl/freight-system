const { Order, ReleaseRecord, FinanceRecord } = require('../models');
const { ok, fail, asyncHandler } = require('../utils/response');
const { withTransaction } = require('../services/transaction');

// 计算订单应收未收余额
async function receivableBalance(orderId) {
  const rows = await FinanceRecord.findAll({ where: { orderId, direction: 'receivable' } });
  let bal = 0;
  for (const r of rows) bal += Number(r.amount) - Number(r.paidAmount);
  return bal;
}

// 放单申请列表（按订单）
const list = asyncHandler(async (req, res) => {
  const { orderId } = req.query;
  const where = orderId ? { orderId } : {};
  const rows = await ReleaseRecord.findAll({ where, order: [['id', 'DESC']] });
  ok(res, rows);
});

// 申请放单：校验应收结清，未结清则进入审批（事务）
const apply = asyncHandler(async (req, res) => {
  const { releaseType = 'original', releaseNo, remark } = req.body;
  const order = await Order.findByPk(req.params.id);
  if (!order) return fail(res, '订单不存在', 1, 404);
  const bal = await receivableBalance(order.id);

  const { record, autoApproved } = await withTransaction(async (t) => {
    const record = await ReleaseRecord.create(
      {
        orderId: order.id,
        releaseType,
        releaseNo,
        operatorId: req.user?.id,
        operatorName: req.user?.name || req.user?.username,
        approvalStatus: bal > 0 ? 'pending' : 'approved', // 未结清需审批
        receivableBalance: bal,
        remark,
      },
      { transaction: t }
    );
    const autoApproved = bal <= 0;
    await order.update({ releaseStatus: autoApproved ? 'approved' : 'pending' }, { transaction: t });
    return { record, autoApproved };
  });

  if (autoApproved) {
    return ok(res, { ...record.toJSON(), autoApproved: true, receivableBalance: bal }, '应收已结清，放单已生效');
  }
  ok(res, { ...record.toJSON(), autoApproved: false, receivableBalance: bal }, `应收未结清（${bal}），已提交审批`);
});

// 审批放单（事务）
const approve = asyncHandler(async (req, res) => {
  const { approve = true, remark } = req.body;
  const rec = await ReleaseRecord.findByPk(req.params.id);
  if (!rec) return fail(res, '放单记录不存在', 1, 404);
  if (rec.approvalStatus !== 'pending') return fail(res, '该记录已处理', 1, 400);

  const finalStatus = approve ? 'approved' : 'rejected';
  await withTransaction(async (t) => {
    await rec.update(
      {
        approvalStatus: finalStatus,
        approverId: req.user?.id,
        approverName: req.user?.name || req.user?.username,
        approvedAt: approve ? new Date() : null,
        remark: remark || rec.remark,
      },
      { transaction: t }
    );
    const orderStatus = approve ? 'approved' : 'none';
    await Order.update({ releaseStatus: orderStatus }, { where: { id: rec.orderId }, transaction: t });
  });
  ok(res, rec, approve ? '放单已审批通过' : '放单已驳回');
});

// 放单记录（含订单信息，用于详情）
const records = asyncHandler(async (req, res) => {
  const recs = await ReleaseRecord.findAll({
    where: { orderId: req.params.id },
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo', 'releaseStatus'] }],
    order: [['id', 'DESC']],
  });
  const bal = await receivableBalance(req.params.id);
  const order = await Order.findByPk(req.params.id, { attributes: ['id', 'orderNo', 'releaseStatus'] });
  ok(res, { order, receivableBalance: bal, records: recs });
});

module.exports = { list, apply, approve, records };