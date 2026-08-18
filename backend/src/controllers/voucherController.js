const { ok, fail, asyncHandler, getPagination } = require('../utils/response');
const voucherService = require('../services/voucherService');
const gateway = require('../services/integrationGateway');

// P2-3a 财务凭证导出/推送控制器
// 支持三种动作：preview（预览凭证+统计） / export（下载 JSON/XML） / push（经网关推送 ERP）

function parseFilters(query) {
  return {
    from: query.from || undefined,
    to: query.to || undefined,
    customerId: query.customerId ? Number(query.customerId) : undefined,
    supplierId: query.supplierId ? Number(query.supplierId) : undefined,
    direction: query.direction || undefined,
  };
}

// GET /finance/vouchers/preview
const preview = asyncHandler(async (req, res) => {
  const vouchers = await voucherService.buildVouchers(parseFilters(req.query));
  ok(res, {
    vouchers: vouchers.map((v) => ({ no: v.no, period: v.period, direction: v.direction, date: v.date, lineCount: v.lines.length, total: v.total, summary: v.summary })),
    stats: voucherService.summarize(vouchers),
  });
});

// GET /finance/vouchers/export?format=json|xml  → 下载文件
const exportVoucher = asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  if (!['json', 'xml'].includes(format)) return fail(res, 'format 仅支持 json/xml', 1, 400);
  const vouchers = await voucherService.buildVouchers(parseFilters(req.query));
  const filename = `vouchers-${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === 'xml') {
    const xml = voucherService.toYonyouXML(vouchers);
    res.setHeader('Content-Type', 'application/xml; charset=gb2312');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(xml);
  }
  const payload = voucherService.toKingdeeJSON(vouchers);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(payload, null, 2));
});

// POST /finance/vouchers/push  经网关推送凭证至金蝶/用友（finance 对接）
const pushVoucher = asyncHandler(async (req, res) => {
  const vouchers = await voucherService.buildVouchers({ ...parseFilters(req.query), ...req.body });
  if (vouchers.length === 0) return fail(res, '当前筛选条件下没有可推送的凭证', 1, 400);
  const format = String(req.body.format || 'json').toLowerCase();
  const payload = format === 'xml' ? { xml: voucherService.toYonyouXML(vouchers) } : voucherService.toKingdeeJSON(vouchers);
  const result = await gateway.send('finance', { action: 'voucher', payload }, {
    messageType: 'VOUCHER_PUSH',
    refNo: `${vouchers[0].period}-${vouchers.length}`,
    idemKey: `voucher-push-${vouchers[0].period}-${vouchers.length}-${Date.now()}`,
  });
  ok(res, { ...result, pushed: vouchers.length, stats: voucherService.summarize(vouchers) }, `已推送 ${vouchers.length} 张凭证`);
});

// P2-3b 数电发票：推送已开票发票至税务平台（digitalTax 对接）
// body: { invoiceIds: [] } — 从 invoice 状态为 issued 的发票推送
const pushInvoice = asyncHandler(async (req, res) => {
  const { invoiceIds } = req.body;
  if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return fail(res, '请选择要推送的发票', 1, 400);
  }
  const { Invoice } = require('../services/dataAccess');
  const invoices = await Invoice.findAll({ where: { id: invoiceIds } });
  const payload = {
    invoices: invoices.map((i) => ({
      id: i.id, invoiceNo: i.invoiceNo, invoiceType: i.invoiceType,
      orderId: i.orderId, amount: Number(i.amount), taxRate: Number(i.taxRate),
      taxAmount: Number(i.taxAmount), totalAmount: Number(i.totalAmount),
      currency: i.currency, items: i.items,
    })),
  };
  const result = await gateway.send('digitalTax', payload, {
    messageType: 'INVOICE_ISSUE',
    refNo: `${invoices.length}张发票`,
    idemKey: `inv-push-${invoices.map((i) => i.id).join('_')}`,
  });
  ok(res, { ...result, pushed: invoices.length }, `已推送 ${invoices.length} 张数电发票`);
});

module.exports = { preview, exportVoucher, pushVoucher, pushInvoice };