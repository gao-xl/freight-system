const { PaymentTransaction, FinanceRecord, Order } = require('../services/dataAccess');
const { Op } = require('sequelize');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { IntegrationClient } = require('../integrations');
const { assertRecordEditable, assertOrderEditable } = require('../services/periodGuard');
const { scopedFindOne, scopedWhere, getScope } = require('../middleware/dataScope');

// P0 资金越权修复：支付交易无隔离列，须先校验其关联业务对象（订单/费用记录）对当前用户可见，
// 防止持 finance 权限的用户提交/查看其它小组订单的支付草稿，进而触发真实资金汇出。
async function assertPayableVisible(req, tx) {
  if (tx.orderId != null) {
    const order = await scopedFindOne(req, Order, { id: tx.orderId });
    if (!order) return false;
  } else if (tx.financeId != null) {
    const rec = await scopedFindOne(req, FinanceRecord, { id: tx.financeId });
    if (!rec) return false;
  }
  return true;
}

// 创建支付/汇出交易
const create = asyncHandler(async (req, res) => {
  const { financeId, orderId, amount, currency, beneficiary, beneficiaryBank, type } = req.body || {};
  if (!amount || Number(amount) <= 0) return fail(res, '交易金额必须大于0');
  // P0 资金越权修复：创建前必须确认关联订单/费用记录对当前用户可见，防止跨组建单
  if (financeId) {
    const rec = await scopedFindOne(req, FinanceRecord, { id: financeId });
    if (!rec) return fail(res, '费用记录不存在或无权访问', 1, 404);
    await assertRecordEditable(rec);
  } else if (orderId != null) {
    const order = await scopedFindOne(req, Order, { id: orderId });
    if (!order) return fail(res, '订单不存在或无权访问', 1, 404);
    await assertOrderEditable(orderId);
  }
  const txNo = `PAY${Date.now()}`;
  const tx = await PaymentTransaction.create({
    txNo, orderId, financeId, amount: Number(amount), currency: currency || 'USD',
    beneficiary, beneficiaryBank, type: type || 'outward', status: 'draft',
  });
  ok(res, tx, '支付交易已创建');
});

// 提交到通道
const submit = asyncHandler(async (req, res) => {
  const tx = await PaymentTransaction.findByPk(req.params.id);
  if (!tx) return fail(res, '交易不存在', 1, 404);
  // P0 资金越权修复：提交会触发真实汇出，必须先确权关联业务对象对当前用户可见
  if (!(await assertPayableVisible(req, tx))) return fail(res, '交易不存在或无权访问', 1, 404);
  if (tx.status !== 'draft') return fail(res, '仅草稿可提交', 1, 400);
  const client = await IntegrationClient.get('usd_pay');
  try {
    const result = await client.send({ amount: Number(tx.amount), currency: tx.currency, beneficiary: tx.beneficiary, orderId: tx.orderId });
    await tx.update({
      status: result.status === 'success' ? 'success' : 'processing',
      externalRef: result.externalRef || null,
      error: result.message || null,
      paidAt: result.status === 'success' ? new Date() : null,
    });
    ok(res, tx, '已提交支付通道');
  } catch (e) {
    await tx.update({ status: 'failed', error: e.message });
    fail(res, `支付通道调用失败：${e.message}`, 1, 502);
  }
});

// 查询状态
const status = asyncHandler(async (req, res) => {
  const tx = await PaymentTransaction.findByPk(req.params.id);
  if (!tx) return fail(res, '交易不存在', 1, 404);
  // P0 资金越权修复：查询状态也不返回跨组交易
  if (!(await assertPayableVisible(req, tx))) return fail(res, '交易不存在或无权访问', 1, 404);
  if (tx.status !== 'processing' && tx.status !== 'success') return ok(res, tx);
  const client = await IntegrationClient.get('usd_pay');
  const result = await client.query({ externalRef: tx.externalRef });
  if (result.status) await tx.update({ status: result.status === 'success' ? 'success' : 'processing', externalRef: result.externalRef || tx.externalRef, paidAt: result.status === 'success' ? new Date() : tx.paidAt });
  ok(res, tx);
});

// 交易列表
const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.orderId) where.orderId = req.query.orderId;
  if (req.query.status) where.status = req.query.status;
  // P0 数据越权修复：按当前用户可见范围过滤关联订单，避免枚举跨组支付/收款明细
  const scopeReq = await getScope(req);
  if (scopeReq.scope !== 'all') {
    const visibleOrderIds = await Order.findAll({
      where: await scopedWhere(req, {}),
      attributes: ['id'],
      raw: true,
    }).then((rows) => rows.map((r) => r.id));
    where[Op.and] = [{ orderId: { [Op.in]: visibleOrderIds.length ? visibleOrderIds : [0] } }];
  }
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { rows, count } = await PaymentTransaction.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset });
  ok(res, { list: rows, total: count, page, pageSize });
});

module.exports = { create, submit, status, list };