// 打印模板渲染引擎
// 模板 JSON + 业务数据JSON → 解析字段 → 渲染 HTML → 生成 PDF/返回
const fs = require('fs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { PrintTemplate } = require('../models');
const { logger } = require('../utils/logger');
const config = require('../config');
const { Semaphore } = require('../utils/semaphore');
const { defaultContent } = require('../data/printFields');
const { htmlToPdf } = require('./pdfRenderer');
const { scopedWhere } = require('../middleware/dataScope');

// 全局 PDF 渲染信号量：限制同时进行的渲染数量（默认 1），
// 防止多用户并发打印时 Chromium 内存叠加把低配服务器打崩。
// 超出限额的打印请求进入排队，普通接口不受影响。
const pdfSemaphore = new Semaphore(config.pdf.maxConcurrency);

// 渲染结果缓存：同 key（单据+模板+参数）在 TTL 内重复打印直接复用，
// 避免反复渲染 PDF 与重复查库。TTL 由 PDF_CACHE_TTL 控制（默认 60s，0=关闭）。
const pdfCache = new Map();
// 渲染缓存键：除单据/模板/参数外，必须纳入数据范围签名（scope + groupIds）。
// 否则高权限用户（如 admin，scope=all）先渲染并缓存后，
// 低权限用户（group/self）打印同单据时会命中该缓存，导致跨组/跨用户数据泄漏（H-01）。
function cacheKey(templateId, docType, bizId, opts, scopeSig) {
  return crypto.createHash('md5').update(JSON.stringify({ templateId, docType, bizId, opts, scope: scopeSig })).digest('hex');
}

// 生成稳定的数据范围签名（用于缓存键隔离）。req 为空（模板预览等无请求场景）时退化为 'default'。
function scopeSignature(req) {
  if (!req || !req.dataScope) return 'default';
  const ds = req.dataScope;
  const gids = Array.isArray(ds.groupIds) ? [...ds.groupIds].sort((a, b) => a - b).join(',') : '';
  return `${ds.scope}:${gids}`;
}
function cacheGet(key) {
  const hit = pdfCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expireAt) { pdfCache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value, ttlMs) {
  if (!ttlMs) return;
  if (pdfCache.size >= 200) pdfCache.clear(); // 触发式兜底，防止无限增长
  pdfCache.set(key, { value, expireAt: Date.now() + ttlMs });
}

// 轻量 pdfkit（PDF_RENDERER=pdfkit）渲染中文所需字体。
// 单证全是中文，pdfkit 默认 Helvetica 不含 CJK 字形，必须注册中文字体。
// 优先容器内的 Noto CJK（Dockerfile 已装 font-noto-cjk），本地开发回退到常见字体。
const CJK_FONT_CANDIDATES = [
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/arphic/ukai.ttc',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/simfang.ttf',
];

// 找到可用的中文字体：.ttc 是字体集合，需用 fontkit 取出具体字体（含 PostScript 名）；
// .ttf/.otf 直接注册即可。找不到返回 null（pdfkit 回退内置 Helvetica）。
function findCjkFont() {
  for (const p of CJK_FONT_CANDIDATES) {
    if (!fs.existsSync(p)) continue;
    if (!p.toLowerCase().endsWith('.ttc')) return { path: p };
    try {
      const fk = require('fontkit');
      const coll = fk.openSync(p);
      const fonts = coll.fonts || [];
      if (!fonts.length) continue;
      // 优先简体中文风格（CJKsc / Sans CJK SC 等明确标识；yahei/wqy/hei 为文泉驿/雅黑等简体字体）。
      // 注意：不能用裸 /sc/ 匹配——"Sans CJK" 里的 s+C 会误命中，必须用含前后缀的精确写法。
      const target = fonts.find((f) => /CJKsc|Sans CJK SC|sc-Regular|simp|yahei|wqy|hei|zh/i.test(`${f.postscriptName || ''} ${f.fullName || ''}`));
      const font = target || fonts[0];
      return { path: p, postscriptName: font.postscriptName };
    } catch (e) {
      logger.warn(`跳过中文字体 ${p}: ${e.message}`);
    }
  }
  return null;
}

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

// M1 修复：模板 header/footer 由管理员配置，但会随每次打印传播给低权限用户浏览。
// 为阻断存储型 XSS，渲染前用黑名单净化：移除脚本/样式/危险标签与事件属性、危险协议。
// 保留基础排版标签（div/span/br/strong/table 等），在"排版权限"与"渲染安全"间取平衡。
function sanitizeTemplateHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<\/script\s*>/gi, '')
    .replace(/<\s*(iframe|object|embed|link|meta|base|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(iframe|object|embed|link|meta|base|form|svg|math)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(["']?)\s*(?:javascript|data):[^"'>]*/gi, (m, attr, q) => `${attr}=${q || ''}'#'`)
    .replace(/<([a-z][a-z0-9]*)\b[^>]*(?:\/?)>/gi, (m, tag) => (ALLOWED_TAGS.has(tag) ? m : ''));
}

// 允许保留下来的基础排版标签（自上而下逐个校验）
const ALLOWED_TAGS = new Set([
  'div', 'span', 'br', 'p', 'strong', 'b', 'em', 'i', 'u', 's',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'small',
]);

// 渲染 HTML
function renderHTML(tpl, blocks, header, footer) {
  const body = blocks.map(blockToHtml).join('');
  const safeHeader = sanitizeTemplateHtml(header);
  const safeFooter = sanitizeTemplateHtml(footer);
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
${safeHeader ? `<div class="page-header">${safeHeader}</div>` : ''}
${body}
${safeFooter ? `<div class="page-footer">${safeFooter}</div>` : ''}
</body></html>`;
}

// 组装业务数据（按 docType 从库加载；opts 支持 D4 对账单客户+周期聚合：{ customerId, from, to }）
// H1 修复：req 为当前请求（含 req.dataScope），所有业务取数统一叠加数据范围过滤，
// 阻断通过枚举 bizId/customerId 越权读取其它小组业务数据的 IDOR 漏洞。
async function loadBizData(docType, bizId, opts = {}, req = null) {
  const { Order, Booking, Customer, Quotation, QuotationItem, CustomsDeclaration, Supplier, Invoice } = require('../models');
  const { findRecordsByOrderId, findRecordsByOrderIds } = require('../domains/finance/financeService');
  const biz = {};
  // 在既有 where 上叠加数据范围约束（req 为空时退化为不限制，供无请求场景的模板预览使用）
  const scoped = async (where) => (req ? scopedWhere(req, where) : where);
  // 按主键取单条并强制归属校验
  const scopedPk = async (model, pk, include) => {
    const where = await scoped({ id: pk });
    return model.findOne({ where, include });
  };
  // D3：debit_note 加入订单取数（DN 基于订单 + 费用明细）
  if (['bl', 'order', 'packing_list', 'customs', 'statement', 'settlement', 'debit_note'].includes(docType)) {
    const order = await scopedPk(Order, bizId, [
      { model: Customer, as: 'customer' },
      { model: Booking, include: [{ model: Supplier, as: 'supplier' }] },
    ]);
    if (order) {
      const o = order.toJSON();
      biz.order = o;
      biz.booking = o.Bookings && o.Bookings[0] ? o.Bookings[0] : {};
      delete o.Bookings;
    }
  }
  // D3 修正：invoice 按 Invoice 模型取数（此前误走 quotation 分支，打不出发票号/税额）
  if (docType === 'invoice') {
    const inv = await scopedPk(Invoice, bizId, [
      { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
      { model: Supplier, as: 'supplier', attributes: ['id', 'code', 'name'] },
      { model: Order, as: 'order' },
    ]);
    if (inv) biz.invoice = inv.toJSON();
  }
  if (docType === 'quotation') {
    const q = await scopedPk(Quotation, bizId, [
      { model: Customer, as: 'customer' },
      { model: QuotationItem, as: 'items' },
    ]);
    if (q) {
      const j = q.toJSON();
      biz.quotation = { ...j, items: (j.items || []).map((i) => ({ ...i, amount: String(i.amount) })) };
    }
  }
  if (docType === 'customs') {
    const c = await scopedPk(CustomsDeclaration, bizId, null);
    if (c) biz.customs = c.toJSON();
  }
  if (docType === 'statement' || docType === 'settlement' || docType === 'debit_note') {
    if (docType === 'statement' && opts.customerId && opts.from) {
      // D4 对账单：按客户 + 期间聚合多票（期初/本期/已收已付/未结余额 + 账单号）
      // H1 修复：customerId 由请求参数控制，必须叠加数据范围约束，防止指定任意客户聚合其账单
      const orders = await Order.findAll({ where: await scoped({ customerId: opts.customerId }), attributes: ['id'] });
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

// 轻量 pdfkit 纯文本渲染（无 Chromium，几乎不占内存）；仅保留文字内容，版式降级
function renderPdfkit(html, pageSize) {
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
  // 注册中文字体，否则单证中文在 PDF 中会缺字形（空白/方块）
  const font = findCjkFont();
  try {
    if (font) {
      if (font.postscriptName) doc.registerFont('CJK', font.path, font.postscriptName);
      else doc.registerFont('CJK', font.path);
      doc.font('CJK');
    } else {
      doc.font('Helvetica');
    }
  } catch (e) {
    logger.warn(`pdfkit 中文字体注册失败，回退 Helvetica: ${e.message}`);
    doc.font('Helvetica');
  }
  doc.fontSize(10).text(text, { align: 'left' });
  doc.end();
  return done;
}

// 生成 PDF。
//   低配服务器可选项（PDF_RENDERER）：
//     chromium（默认）优先无头浏览器渲染（版式最完整），失败回退 pdfkit；
//     pdfkit          只走轻量渲染，不拉起 Chromium（无内存峰值，版式降级）；
//     off             关闭 PDF 生成，返回 null（由控制器对 PDF 请求返回 503，HTML 预览仍可用）。
async function toPdf(html, pageSize) {
  const renderer = config.pdf.renderer;
  if (renderer === 'off') return null;
  if (renderer === 'pdfkit') return renderPdfkit(html, pageSize);
  const buf = await htmlToPdf(html, pageSize);
  if (buf) return buf;
  return renderPdfkit(html, pageSize);
}

// 主渲染入口（opts：D4 对账单聚合参数 { customerId, from, to }；req：当前请求，用于数据范围过滤）
async function render(templateId, docType, bizId, opts = {}, req = null) {
  const ttlMs = (config.pdf.cacheTtl || 0) * 1000;
  const cKey = cacheKey(templateId, docType, bizId, opts, scopeSignature(req));
  // 缓存命中：直接复用上次渲染结果（带 TTL，降低重复渲染与查库压力）
  const cached = cacheGet(cKey);
  if (cached) {
    logger.debug('[PRINT] 命中缓存', { docType, bizId, templateId });
    return cached;
  }
  // 未命中：进入信号量排队，限制并发渲染，防止 Chromium 内存叠加 OOM
  return pdfSemaphore.run(async () => {
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
    const bizData = await loadBizData(tpl.docType || docType, bizId, opts, req);
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
    const result = { html, pdf, tpl };
    cacheSet(cKey, result, ttlMs);
    return result;
  });
}

module.exports = { render, resolveFields, renderHTML, loadBizData, getByPath, formatValue, escapeHtml, safeUrl };