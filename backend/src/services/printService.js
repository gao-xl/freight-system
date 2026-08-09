// 打印模板渲染引擎
// 模板 JSON + 业务数据JSON → 解析字段 → 渲染 HTML → 生成 PDF/返回
const { Op } = require('sequelize');
const { PrintTemplate } = require('../models');
const { logger } = require('../utils/logger');
const { defaultContent } = require('../data/printFields');
const { htmlToPdf } = require('./pdfRenderer');

// 按点路径从数据对象取值，如 order.customer.name
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// HTML 实体转义：阻断打印模板中的存储型 XSS（业务字段/用户配置值在渲染前必须转义）
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 对用于属性值的 URL 做协议白名单校验，仅允许 http/https 与相对路径，阻断 javascript: 类攻击
function safeUrl(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (/^(https?:)?\/\//i.test(s) || /^\/(?!\/)/.test(s) || /^[^/\\:]+$/.test(s)) return escapeHtml(s);
  return '';
}

// 值格式化
function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'date') {
    const d = new Date(value);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return value;
  }
  if (type === 'money') {
    const n = Number(value);
    return isNaN(n) ? value : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

// 解析字段变量，用业务数据填充
function resolveFields(blocks, bizData) {
  for (const block of blocks) {
    if (block.type === 'fields' && Array.isArray(block.fields)) {
      for (const f of block.fields) {
        if (!f.show) { f.value = ''; continue; }
        const raw = getByPath(bizData, f.key);
        f.value = formatValue(raw, f.type);
      }
    }
  }
  return blocks;
}

// 区块 → HTML
function blockToHtml(block) {
  switch (block.type) {
    case 'header':
      // bold 为模板配置的布尔值：先判布尔再输出，避免转义后 String(false)='false' 恒真导致误加粗
      const fontWeight = block.bold === true ? 'bold' : 'normal';
      return `<div class="blk-header" style="text-align:${escapeHtml(block.align) || 'center'};font-size:${escapeHtml(block.fontSize) || 18}px;font-weight:${fontWeight};">${escapeHtml(block.title)}</div>`;
    case 'logo':
      return safeUrl(block.url) ? `<div class="blk-logo"><img src="${safeUrl(block.url)}" style="width:${escapeHtml(block.width) || 160}px"/></div>` : '';
    case 'fields': {
      const rows = [];
      const cols = block.columns || 2;
      let row = [];
      for (const f of block.fields || []) {
        if (!f.show) continue;
        row.push(`<div class="field" style="flex:${100 / cols}%;"><span class="label">${escapeHtml(f.label)}：</span><span class="val">${escapeHtml(f.value)}</span></div>`);
        if (row.length >= cols) { rows.push(row); row = []; }
      }
      if (row.length) rows.push(row);
      return `<div class="blk-fields">${rows.map((r) => `<div class="field-row">${r.join('')}</div>`).join('')}</div>`;
    }
    case 'table': {
      const cols = block.columns || [];
      const head = cols.map((c) => `<th>${escapeHtml(c.label || c.key)}</th>`).join('');
      // 从 bizData 聚合取行（quotation.items）
      const rowsData = block.data || [];
      const body = rowsData.map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(getByPath(r, c.key) ?? '-')}</td>`).join('')}</tr>`).join('');
      return `<div class="blk-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case 'sign':
      return `<div class="blk-sign"><div class="sign-row">${(block.columns || []).map((c) => `<div class="sign-item">${escapeHtml(c)}：______________</div>`).join('')}</div></div>`;
    case 'footer':
      return `<div class="blk-footer" style="text-align:${escapeHtml(block.align) || 'center'};">${escapeHtml(block.text)}</div>`;
    default:
      return '';
  }
}

// 渲染 HTML
function renderHTML(tpl, blocks, header, footer) {
  const body = blocks.map(blockToHtml).join('');
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"/>
<style>
  body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',-apple-system,sans-serif;color:#222;margin:24px;}
  .blk-header{margin-bottom:16px;}
  .blk-logo{margin-bottom:12px;}
  .blk-fields{margin-bottom:12px;}
  .field-row{display:flex;}
  .field{margin-bottom:6px;}
  .label{color:#666;}
  .blk-table table{width:100%;border-collapse:collapse;margin-bottom:12px;}
  .blk-table th,.blk-table td{border:1px solid #ccc;padding:6px 8px;font-size:13px;}
  .blk-table th{background:#f5f5f5;}
  .blk-sign .sign-row{display:flex;gap:24px;margin:24px 0;}
  .blk-footer{color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:8px;}
  .page-header,.page-footer{font-size:12px;color:#888;}
  /* 打印分页：表格跨页时表头重复、行不折断（D1） */
  @media print {
    .blk-table thead{display:table-header-group;}
    .blk-table tr{page-break-inside:avoid;}
    .blk-header,.blk-fields,.blk-sign{page-break-after:avoid;}
  }
</style></head><body>
${header ? `<div class="page-header">${header}</div>` : ''}
${body}
${footer ? `<div class="page-footer">${footer}</div>` : ''}
</body></html>`;
}

// 组装业务数据（按 docType 从库加载；opts 支持 D4 对账单客户+周期聚合：{ customerId, from, to }）
async function loadBizData(docType, bizId, opts = {}) {
  const { Order, Booking, Customer, Quotation, QuotationItem, CustomsDeclaration, Supplier, Invoice } = require('../models');
  const { findRecordsByOrderId, findRecordsByOrderIds } = require('../domains/finance/financeService');
  const biz = {};
  // D3：debit_note 加入订单取数（DN 基于订单 + 费用明细）
  if (['bl', 'order', 'packing_list', 'customs', 'statement', 'settlement', 'debit_note'].includes(docType)) {
    const order = await Order.findByPk(bizId, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Booking, include: [{ model: Supplier, as: 'supplier' }] },
      ],
    });
    if (order) {
      const o = order.toJSON();
      biz.order = o;
      biz.booking = o.Bookings && o.Bookings[0] ? o.Bookings[0] : {};
      delete o.Bookings;
    }
  }
  // D3 修正：invoice 按 Invoice 模型取数（此前误走 quotation 分支，打不出发票号/税额）
  if (docType === 'invoice') {
    const inv = await Invoice.findByPk(bizId, {
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
        { model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] },
        { model: Order, as: 'order' },
      ],
    });
    if (inv) biz.invoice = inv.toJSON();
  }
  if (docType === 'quotation') {
    const q = await Quotation.findByPk(bizId, {
      include: [
        { model: Customer, as: 'customer' },
        { model: QuotationItem, as: 'items' },
      ],
    });
    if (q) {
      const j = q.toJSON();
      biz.quotation = { ...j, items: (j.items || []).map((i) => ({ ...i, amount: String(i.amount) })) };
    }
  }
  if (docType === 'customs') {
    const c = await CustomsDeclaration.findByPk(bizId);
    if (c) biz.customs = c.toJSON();
  }
  if (docType === 'statement' || docType === 'settlement' || docType === 'debit_note') {
    if (docType === 'statement' && opts.customerId && opts.from) {
      // D4 对账单：按客户 + 期间聚合多票（期初/本期/已收已付/未结余额 + 账单号）
      const orders = await Order.findAll({ where: { customerId: opts.customerId }, attributes: ['id'] });
      const orderIds = orders.map((o) => o.id);
      const from = new Date(opts.from);
      const to = opts.to ? new Date(`${opts.to}T23:59:59.999`) : new Date();
      const fin = orderIds.length
        ? await findRecordsByOrderIds(orderIds)
        : [];
      const period = fin.filter((f) => { const d = new Date(f.createdAt); return d >= from && d <= to; });
      let openingReceivable = 0, openingPayable = 0; // 期初未结（本期前发生且未收/未付）
      let periodReceivable = 0, periodPayable = 0;   // 本期发生
      let received = 0, paid = 0;                    // 本期实收实付（paidAt 落在期间）
      let receivableBalance = 0, payableBalance = 0; // 截至期末未结余额
      for (const f of fin) {
        const d = new Date(f.createdAt);
        const amt = Number(f.amount), paidAmt = Number(f.paidAmount);
        const payDate = f.paidAt ? new Date(f.paidAt) : null;
        const inPayRange = payDate && payDate >= from && payDate <= to;
        const isRecv = f.direction === 'receivable';
        if (d <= to) {
          if (d < from) {
            if (isRecv) openingReceivable += amt - paidAmt; else openingPayable += amt - paidAmt;
          } else {
            if (isRecv) periodReceivable += amt; else periodPayable += amt;
          }
        }
        if (isRecv) receivableBalance += (d <= to ? amt - paidAmt : 0);
        else payableBalance += (d <= to ? amt - paidAmt : 0);
        if (inPayRange) { if (isRecv) received += paidAmt; else paid += paidAmt; }
      }
      biz.finance = period.map((f) => f.toJSON());
      biz.statementSummary = {
        statementNo: `ST${Date.now()}`,
        periodFrom: opts.from,
        periodTo: opts.to || new Date().toISOString().slice(0, 10),
        openingReceivable,
        openingPayable,
        periodReceivable,
        periodPayable,
        received,
        paid,
        receivableBalance,
        payableBalance,
        orderCount: orderIds.length,
      };
    } else {
      const fin = await findRecordsByOrderId(bizId);
      biz.finance = (fin || []).map((f) => f.toJSON());
    }
  }
  return biz;
}

// 生成 PDF（D1 修复：优先 puppeteer-core 无头浏览器渲染，保留完整版式与中文；
// 无可用浏览器环境时回退 pdfkit 纯文本——仅保证"能出 PDF"，版式降级）
async function toPdf(html, pageSize) {
  const buf = await htmlToPdf(html, pageSize);
  if (buf) return buf;
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: pageSize || 'A4', margin: 40 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const text = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  doc.font('Helvetica').fontSize(10).text(text, { align: 'left' });
  doc.end();
  return done;
}

// 主渲染入口（opts：D4 对账单聚合参数 { customerId, from, to }）
async function render(templateId, docType, bizId, opts = {}) {
  let tpl = null;
  if (templateId) {
    tpl = await PrintTemplate.findByPk(templateId);
  }
  if (!tpl && docType) {
    tpl = await PrintTemplate.findOne({ where: { docType, isDefault: true } });
  }
  if (!tpl && docType) {
    // 无模板时用默认内容
    tpl = { docType, content: JSON.stringify(defaultContent(docType)), pageSize: 'A4', header: '', footer: '' };
  }
  const bizData = await loadBizData(tpl.docType || docType, bizId, opts);
  const content = typeof tpl.content === 'string' ? JSON.parse(tpl.content) : tpl.content;
  const blocks = resolveFields(content.blocks || [], bizData);
  // 表格数据注入
  for (const b of blocks) {
    if (b.type === 'table') {
      if (b.key === 'quotation.items') b.data = bizData.quotation?.items || [];
      if (b.key === 'finance') b.data = bizData.finance || [];
    }
  }
  const html = renderHTML(tpl, blocks, tpl.header, tpl.footer);
  const pdf = await toPdf(html, tpl.pageSize);
  logger.info('[PRINT] 渲染完成', { docType: tpl.docType, bizId, templateId });
  return { html, pdf, tpl };
}

module.exports = { render, resolveFields, renderHTML, loadBizData, getByPath, formatValue, escapeHtml, safeUrl };