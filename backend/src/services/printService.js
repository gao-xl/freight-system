// 打印模板渲染引擎
// 模板 JSON + 业务数据JSON → 解析字段 → 渲染 HTML → 生成 PDF/返回
const { PrintTemplate } = require('../models');
const { logger } = require('../utils/logger');
const { defaultContent } = require('../data/printFields');

// 按点路径从数据对象取值，如 order.customer.name
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
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
      return `<div class="blk-header" style="text-align:${block.align || 'center'};font-size:${block.fontSize || 18}px;font-weight:${block.bold ? 'bold' : 'normal'};">${block.title || ''}</div>`;
    case 'logo':
      return block.url ? `<div class="blk-logo"><img src="${block.url}" style="width:${block.width || 160}px"/></div>` : '';
    case 'fields': {
      const rows = [];
      const cols = block.columns || 2;
      let row = [];
      for (const f of block.fields || []) {
        if (!f.show) continue;
        row.push(`<div class="field" style="flex:${100 / cols}%;"><span class="label">${f.label || ''}：</span><span class="val">${f.value || ''}</span></div>`);
        if (row.length >= cols) { rows.push(row); row = []; }
      }
      if (row.length) rows.push(row);
      return `<div class="blk-fields">${rows.map((r) => `<div class="field-row">${r.join('')}</div>`).join('')}</div>`;
    }
    case 'table': {
      const cols = block.columns || [];
      const head = cols.map((c) => `<th>${c.label || c.key}</th>`).join('');
      // 从 bizData 聚合取行（quotation.items）
      const rowsData = block.data || [];
      const body = rowsData.map((r) => `<tr>${cols.map((c) => `<td>${getByPath(r, c.key) ?? '-'}</td>`).join('')}</tr>`).join('');
      return `<div class="blk-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case 'sign':
      return `<div class="blk-sign"><div class="sign-row">${(block.columns || []).map((c) => `<div class="sign-item">${c}：______________</div>`).join('')}</div></div>`;
    case 'footer':
      return `<div class="blk-footer" style="text-align:${block.align || 'center'};">${block.text || ''}</div>`;
    default:
      return '';
  }
}

// 渲染 HTML
function renderHTML(tpl, blocks, header, footer) {
  const body = blocks.map(blockToHtml).join('');
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"/>
<style>
  body{font-family:-apple-system,'Microsoft YaHei',sans-serif;color:#222;margin:24px;}
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
</style></head><body>
${header ? `<div class="page-header">${header}</div>` : ''}
${body}
${footer ? `<div class="page-footer">${footer}</div>` : ''}
</body></html>`;
}

// 组装业务数据（按 docType 从库加载）
async function loadBizData(docType, bizId) {
  const { Order, Booking, Customer, Quotation, QuotationItem, CustomsDeclaration, FinanceRecord, Supplier } = require('../models');
  const biz = {};
  if (['bl', 'order', 'invoice', 'packing_list', 'customs', 'statement', 'settlement'].includes(docType)) {
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
  if (['invoice', 'quotation'].includes(docType)) {
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
  if (docType === 'statement' || docType === 'settlement') {
    const fin = await FinanceRecord.findAll({ where: { orderId: bizId } });
    biz.finance = (fin || []).map((f) => f.toJSON());
  }
  return biz;
}

// 生成 PDF（使用 pdfkit，简单单据；复杂单据可换 puppeteer）
function toPdf(html, pageSize) {
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

// 主渲染入口
async function render(templateId, docType, bizId) {
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
  const bizData = await loadBizData(tpl.docType || docType, bizId);
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

module.exports = { render, resolveFields, renderHTML, loadBizData, getByPath, formatValue };