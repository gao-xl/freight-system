'use strict';

// 对账域服务（P0 对账功能）
// 职责：应收/应付/单票三维对账，关联 Invoice、DebitNote、BillOfLading、FinanceRecord

const { Op } = require('sequelize');
const { FinanceRecord, Invoice, Order, Customer, Supplier, DebitNote, BillOfLading } = require('../../models');

// ===== 应收对账：Invoice ↔ House BL ↔ FinanceRecord(应收) =====
async function reconcileReceivable(where) {
  const fees = await FinanceRecord.findAll({
    where: { ...where, direction: 'receivable' },
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo', 'customerId'],
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }] },
    ],
    order: [['id', 'ASC']],
  });

  const orderIds = [...new Set(fees.map((f) => f.orderId).filter(Boolean))];
  const invWhere = { invoiceType: 'receivable', status: { [Op.in]: ['issued', 'paid'] }, ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) invWhere.orderId = { [Op.in]: orderIds };

  const invoices = await Invoice.findAll({ where: invWhere, order: [['id', 'ASC']] });

  const blWhere = { blType: 'house', ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) blWhere.orderId = { [Op.in]: orderIds };

  const hbls = await BillOfLading.findAll({
    where: blWhere,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
    order: [['id', 'ASC']],
  });

  return buildARReconcile(fees, invoices, hbls);
}

function buildARReconcile(fees, invoices, hbls) {
  // 按订单分组
  const byOrder = {};
  for (const f of fees) {
    const oid = f.orderId;
    if (!byOrder[oid]) byOrder[oid] = { orderId: oid, orderNo: f.order?.orderNo || '', customerName: f.order?.customer?.name || '', fees: [], invoices: [], hbls: [], receivable: 0, paid: 0, invoiced: 0 };
    byOrder[oid].fees.push(f);
    byOrder[oid].receivable += Number(f.amount);
    byOrder[oid].paid += Number(f.paidAmount);
  }
  for (const inv of invoices) {
    const oid = inv.orderId;
    if (oid && byOrder[oid]) {
      byOrder[oid].invoices.push({ id: inv.id, invoiceNo: inv.invoiceNo, amount: Number(inv.totalAmount || inv.amount), status: inv.status });
      byOrder[oid].invoiced += Number(inv.totalAmount || inv.amount);
    }
  }
  for (const bl of hbls) {
    const oid = bl.orderId;
    if (oid && byOrder[oid]) {
      byOrder[oid].hbls.push({ id: bl.id, blNo: bl.blNo, status: bl.status });
    }
  }

  const items = Object.values(byOrder).map((g) => ({
    ...g,
    balance: g.receivable - g.paid,
    invoiceGap: g.receivable - g.invoiced,
    hasBl: g.hbls.length > 0,
    feeCount: g.fees.length,
    invoiceCount: g.invoices.length,
    blCount: g.hbls.length,
    matched: g.receivable <= g.invoiced + 0.01 && g.receivable > 0,
  }));

  const totalReceivable = items.reduce((s, i) => s + i.receivable, 0);
  const totalPaid = items.reduce((s, i) => s + i.paid, 0);
  const totalInvoiced = items.reduce((s, i) => s + i.invoiced, 0);
  const unmatchedItems = items.filter((i) => !i.matched);

  return {
    generatedAt: new Date().toISOString(),
    totalReceivable: Number(totalReceivable.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalInvoiced: Number(totalInvoiced.toFixed(2)),
    balance: Number((totalReceivable - totalPaid).toFixed(2)),
    invoiceGap: Number((totalReceivable - totalInvoiced).toFixed(2)),
    matchedCount: items.length - unmatchedItems.length,
    unmatchedCount: unmatchedItems.length,
    items,
    unmatched: unmatchedItems,
  };
}

// ===== 应付对账：DebitNote ↔ Master BL ↔ FinanceRecord(应付) =====
async function reconcilePayable(where) {
  const fees = await FinanceRecord.findAll({
    where: { ...where, direction: 'payable' },
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
    ],
    order: [['id', 'ASC']],
  });

  const orderIds = [...new Set(fees.map((f) => f.orderId).filter(Boolean))];
  const dnWhere = { status: { [Op.in]: ['issued', 'paid'] }, ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) dnWhere.orderId = { [Op.in]: orderIds };

  const debitNotes = await DebitNote.findAll({
    where: dnWhere,
    include: [
      { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code'] },
      { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
      { model: BillOfLading, as: 'bl', attributes: ['id', 'blNo', 'blType'] },
    ],
    order: [['id', 'ASC']],
  });

  const blWhere = { blType: 'master', ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) blWhere.orderId = { [Op.in]: orderIds };

  const mbls = await BillOfLading.findAll({
    where: blWhere,
    include: [
      { model: Supplier, as: 'carrier', attributes: ['id', 'name', 'code'] },
    ],
    order: [['id', 'ASC']],
  });

  return buildAPReconcile(fees, debitNotes, mbls);
}

function buildAPReconcile(fees, debitNotes, mbls) {
  // 按供应商分组
  const bySupplier = {};
  for (const f of fees) {
    const sid = f.counterpartyId || 0;
    const key = `supplier_${sid}`;
    if (!bySupplier[key]) bySupplier[key] = { supplierId: sid, supplierName: '', fees: [], debitNotes: [], mbls: [], payable: 0, paid: 0, debited: 0 };
    bySupplier[key].fees.push(f);
    bySupplier[key].payable += Number(f.amount);
    bySupplier[key].paid += Number(f.paidAmount);
  }
  for (const dn of debitNotes) {
    const sid = dn.supplierId || 0;
    const key = `supplier_${sid}`;
    if (!bySupplier[key]) bySupplier[key] = { supplierId: sid, supplierName: dn.supplier?.name || '', fees: [], debitNotes: [], mbls: [], payable: 0, paid: 0, debited: 0 };
    bySupplier[key].supplierName = dn.supplier?.name || '';
    bySupplier[key].debitNotes.push({ id: dn.id, debitNoteNo: dn.debitNoteNo, amount: Number(dn.totalAmount || dn.amount), status: dn.status });
    bySupplier[key].debited += Number(dn.totalAmount || dn.amount);
  }
  for (const bl of mbls) {
    const sid = bl.carrierId || 0;
    const key = `supplier_${sid}`;
    if (!bySupplier[key]) bySupplier[key] = { supplierId: sid, supplierName: bl.carrier?.name || '', fees: [], debitNotes: [], mbls: [], payable: 0, paid: 0, debited: 0 };
    bySupplier[key].supplierName = bl.carrier?.name || '';
    bySupplier[key].mbls.push({ id: bl.id, blNo: bl.blNo, status: bl.status });
  }

  const items = Object.values(bySupplier).map((g) => ({
    ...g,
    balance: g.payable - g.paid,
    debitGap: g.payable - g.debited,
    hasMbl: g.mbls.length > 0,
    feeCount: g.fees.length,
    debitNoteCount: g.debitNotes.length,
    mblCount: g.mbls.length,
    matched: g.payable <= g.debited + 0.01 && g.payable > 0,
  }));

  const totalPayable = items.reduce((s, i) => s + i.payable, 0);
  const totalPaid = items.reduce((s, i) => s + i.paid, 0);
  const totalDebited = items.reduce((s, i) => s + i.debited, 0);
  const unmatchedItems = items.filter((i) => !i.matched);

  return {
    generatedAt: new Date().toISOString(),
    totalPayable: Number(totalPayable.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalDebited: Number(totalDebited.toFixed(2)),
    balance: Number((totalPayable - totalPaid).toFixed(2)),
    debitGap: Number((totalPayable - totalDebited).toFixed(2)),
    matchedCount: items.length - unmatchedItems.length,
    unmatchedCount: unmatchedItems.length,
    items,
    unmatched: unmatchedItems,
  };
}

// ===== 单票对账：按订单维度，主单(应付) vs 分单(应收) 毛利 =====
async function reconcilePerShipment(where) {
  const fees = await FinanceRecord.findAll({
    where: { ...where },
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'],
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] }] },
    ],
    order: [['orderId', 'ASC']],
  });

  const orderIds = [...new Set(fees.map((f) => f.orderId).filter(Boolean))];
  const blWhere = { ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) blWhere.orderId = { [Op.in]: orderIds };

  const bls = await BillOfLading.findAll({
    where: blWhere,
    include: [
      { model: Order, as: 'order', attributes: ['id', 'orderNo'] },
      { model: Supplier, as: 'carrier', attributes: ['id', 'name', 'code'] },
    ],
    order: [['orderId', 'ASC']],
  });

  const invWhere = { invoiceType: 'receivable', status: { [Op.in]: ['issued', 'paid'] }, ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) invWhere.orderId = { [Op.in]: orderIds };

  const invoices = await Invoice.findAll({ where: invWhere, order: [['orderId', 'ASC']] });

  const dnWhere = { status: { [Op.in]: ['issued', 'paid'] }, ...(where.groupId ? { groupId: where.groupId } : {}) };
  if (orderIds.length > 0) dnWhere.orderId = { [Op.in]: orderIds };

  const debitNotes = await DebitNote.findAll({ where: dnWhere, order: [['orderId', 'ASC']] });

  return buildPerShipment(fees, bls, invoices, debitNotes);
}

function buildPerShipment(fees, bls, invoices, debitNotes) {
  const byOrder = {};
  for (const f of fees) {
    const oid = f.orderId;
    if (!byOrder[oid]) byOrder[oid] = { orderId: oid, orderNo: f.order?.orderNo || '', customerName: f.order?.customer?.name || '', receivable: 0, payable: 0, mbls: [], hbls: [], invoices: [], debitNotes: [] };
    const amt = f.localAmount != null ? Number(f.localAmount) : Number(f.amount);
    if (f.direction === 'receivable') byOrder[oid].receivable += amt;
    else byOrder[oid].payable += amt;
  }
  for (const bl of bls) {
    const oid = bl.orderId;
    if (!byOrder[oid]) byOrder[oid] = { orderId: oid, orderNo: '', customerName: '', receivable: 0, payable: 0, mbls: [], hbls: [], invoices: [], debitNotes: [] };
    if (bl.blType === 'master') byOrder[oid].mbls.push({ id: bl.id, blNo: bl.blNo, carrier: bl.carrier?.name || '' });
    else byOrder[oid].hbls.push({ id: bl.id, blNo: bl.blNo });
  }
  for (const inv of invoices) {
    const oid = inv.orderId;
    if (oid && byOrder[oid]) byOrder[oid].invoices.push({ id: inv.id, invoiceNo: inv.invoiceNo, amount: Number(inv.totalAmount || inv.amount), status: inv.status });
  }
  for (const dn of debitNotes) {
    const oid = dn.orderId;
    if (oid && byOrder[oid]) byOrder[oid].debitNotes.push({ id: dn.id, debitNoteNo: dn.debitNoteNo, amount: Number(dn.totalAmount || dn.amount), status: dn.status });
  }

  const items = Object.values(byOrder).map((g) => {
    const margin = g.receivable - g.payable;
    const marginRate = g.receivable ? Number(((margin / g.receivable) * 100).toFixed(2)) : 0;
    return {
      ...g,
      margin: Number(margin.toFixed(2)),
      marginRate,
      hasMbl: g.mbls.length > 0,
      hasHbl: g.hbls.length > 0,
      hasInvoice: g.invoices.length > 0,
      hasDebitNote: g.debitNotes.length > 0,
    };
  }).sort((a, b) => b.margin - a.margin);

  const totalReceivable = items.reduce((s, i) => s + i.receivable, 0);
  const totalPayable = items.reduce((s, i) => s + i.payable, 0);
  const totalMargin = totalReceivable - totalPayable;

  return {
    generatedAt: new Date().toISOString(),
    totalReceivable: Number(totalReceivable.toFixed(2)),
    totalPayable: Number(totalPayable.toFixed(2)),
    totalMargin: Number(totalMargin.toFixed(2)),
    overallMarginRate: totalReceivable ? Number(((totalMargin / totalReceivable) * 100).toFixed(2)) : 0,
    shipmentCount: items.length,
    items,
  };
}

module.exports = {
  reconcileReceivable,
  buildARReconcile,
  reconcilePayable,
  buildAPReconcile,
  reconcilePerShipment,
  buildPerShipment,
  exportExcel,
  autoMatch,
};

// ===== 导出对账结果为 Excel =====
async function exportExcel(type, where) {
  let data, headers, sheetName;
  if (type === 'ar') {
    data = await reconcileReceivable(where);
    headers = ['订单号', '客户', '应收金额', '已收款', '已开票', '余额', '发票缺口', '发票数', '分单数', '状态'];
    sheetName = '应收对账';
    data = data.items.map((i) => [i.orderNo, i.customerName, i.receivable, i.paid, i.invoiced, i.balance, i.invoiceGap, i.invoiceCount, i.blCount, i.matched ? '已匹配' : '未匹配']);
  } else if (type === 'ap') {
    data = await reconcilePayable(where);
    headers = ['供应商', '应付金额', '已付款', '已借记', '余额', '借记缺口', '借记单数', '主单数', '状态'];
    sheetName = '应付对账';
    data = data.items.map((i) => [i.supplierName, i.payable, i.paid, i.debited, i.balance, i.debitGap, i.debitNoteCount, i.mblCount, i.matched ? '已匹配' : '未匹配']);
  } else {
    data = await reconcilePerShipment(where);
    headers = ['订单号', '客户', '应收', '应付', '毛利', '毛利率(%)', '有主单', '有分单', '有发票', '有借记单'];
    sheetName = '单票对账';
    data = data.items.map((i) => [i.orderNo, i.customerName, i.receivable, i.payable, i.margin, i.marginRate, i.hasMbl ? '是' : '否', i.hasHbl ? '是' : '否', i.hasInvoice ? '是' : '否', i.hasDebitNote ? '是' : '否']);
  }
  return buildXlsx(headers, data, sheetName);
}

function buildXlsx(headers, rows, sheetName) {
  // 轻量 XLSX 生成，不引入额外依赖，输出最小可用 xlsx
  const escapeXml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colLetters = headers.map((_, i) => {
    let n = i; let c = '';
    while (n >= 0) { c = String.fromCharCode(65 + (n % 26)) + c; n = Math.floor(n / 26) - 1; }
    return c;
  });

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
${[headers, ...rows].map((row, ri) => `<row r="${ri + 1}">${row.map((cell, ci) => `<c r="${colLetters[ci]}${ri + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`).join('')}</row>`).join('\n')}
</sheetData></worksheet>`;

  return Buffer.from(sheetXml, 'utf-8');
}

// ===== 自动匹配：费用 ↔ 发票/借记通知单 =====
async function autoMatch(where) {
  const fees = await FinanceRecord.findAll({
    where: { ...where },
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderNo'] }],
  });

  const invoices = await Invoice.findAll({
    where: { invoiceType: 'receivable', status: 'issued' },
  });
  const debitNotes = await DebitNote.findAll({
    where: { status: 'issued' },
  });

  // 按订单匹配：同一订单的应收费用 → 发票，应付费用 → 借记通知单
  const matches = [];
  for (const fee of fees) {
    if (fee.direction === 'receivable') {
      const inv = invoices.find((i) => i.orderId === fee.orderId);
      if (inv && fee.invoiceNo !== inv.invoiceNo) {
        fee.invoiceNo = inv.invoiceNo;
        await fee.save();
        matches.push({ feeId: fee.id, orderNo: fee.order?.orderNo, direction: 'receivable', matchedTo: inv.invoiceNo, type: 'invoice' });
      }
    } else {
      const dn = debitNotes.find((d) => d.orderId === fee.orderId);
      if (dn && fee.invoiceNo !== dn.debitNoteNo) {
        fee.invoiceNo = dn.debitNoteNo;
        await fee.save();
        matches.push({ feeId: fee.id, orderNo: fee.order?.orderNo, direction: 'payable', matchedTo: dn.debitNoteNo, type: 'debitNote' });
      }
    }
  }

  return { matched: matches.length, details: matches };
}