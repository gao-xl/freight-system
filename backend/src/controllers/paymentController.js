const { PaymentTransaction, FinanceRecord } = require('../services/dataAccess');
const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const { IntegrationClient } = require('../integrations');
const { assertRecordEditable, assertOrderEditable } = require('../services/periodGuard');

// 创建支付/汇出交易
const create = asyncHandler(async (req, res) => {
  const { financeId, orderId, amount, currency, beneficiary, beneficiaryBank, type } = req.body || {};
  if (!amount || Number(amount) <= 0) return fail(res, '交易金额必须大于0');
  // 锁账拦截：关联费用或订单落入已锁账期则拒绝
  if (financeId) {
    const rec = await FinanceRecord.findByPk(financeId);
    await assertRecordEditable(rec);
  } else {
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
  const { page, pageSize, offset, limit } = getPagination(req.query);
  const { rows, count } = await PaymentTransaction.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset });
  ok(res, { list: rows, total: count, page, pageSize });
});

module.exports = { create, submit, status, list };