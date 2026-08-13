// 内置专用打印版式
// 为提单/对账单/发票/费用通知单提供接近真实纸质单据的固定版式，
// 替代通用的"标题 + 字段表单"默认模板。仅当用户未通过 template 参数指定自定义模板时使用。
// 渲染安全：所有业务字段在输出前均经 escapeHtml 转义，阻断存储型 XSS。

// 支持的文档类型
const SUPPORTED = ['bl', 'statement', 'invoice', 'debit_note'];

function supports(docType) {
  return SUPPORTED.includes(docType);
}

// ---------- 安全与格式化工具 ----------
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return isNaN(n) ? String(value) : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toISOString().slice(0, 10);
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// 多行文本转 <br/>（用于地址/唛头等）
function lines(value) {
  if (value === null || value === undefined) return '';
  return escapeHtml(String(value)).replace(/\n/g, '<br/>');
}

// ---------- 公共页壳 ----------
function pageShell(title, subtitle, noLabel, noValue, body, opts = {}) {
  const footer = opts.footer || '本单由货代管理系统生成';
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"/>
<style>
  @page{size:A4;margin:0;}
  *{box-sizing:border-box;}
  body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',-apple-system,sans-serif;color:#111;margin:0;padding:0;}
  .page{width:100%;padding:26px 30px;position:relative;}
  .doc-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px double #333;padding-bottom:10px;margin-bottom:18px;}
  .doc-head .title{font-size:26px;font-weight:700;letter-spacing:3px;color:#111;}
  .doc-head .subtitle{font-size:12px;color:#555;margin-top:4px;letter-spacing:1px;}
  .doc-head .no{font-size:12px;text-align:right;line-height:1.7;color:#333;}
  .doc-head .no b{font-size:16px;letter-spacing:1px;}
  .doc-foot{margin-top:30px;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#888;text-align:center;}
  .meta{width:100%;border-collapse:collapse;margin-bottom:14px;}
  .meta td{border:1px solid #bbb;padding:8px 10px;vertical-align:top;font-size:13px;}
  .meta .lbl{font-size:11px;color:#555;font-weight:600;letter-spacing:1px;margin-bottom:4px;}
  .meta .val{line-height:1.6;}
  table.detail{width:100%;border-collapse:collapse;margin-bottom:14px;}
  table.detail th,table.detail td{border:1px solid #999;padding:7px 9px;font-size:12px;vertical-align:top;}
  table.detail th{background:#f2f2f2;font-size:11px;letter-spacing:0.5px;text-align:left;}
  table.detail td.num{text-align:right;white-space:nowrap;}
  .total-row td{font-weight:700;background:#fafafa;}
  .sign-row{display:flex;justify-content:space-between;margin-top:40px;font-size:12px;}
  .sign-row .sign{width:42%;}
  .sign-row .line{border-bottom:1px solid #333;height:34px;margin-bottom:6px;}
  @media print{body{-webkit-print-color-adjust:exact;}}
</style></head><body><div class="page">
  <div class="doc-head">
    <div>
      <div class="title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    ${noLabel ? `<div class="no">${escapeHtml(noLabel)}<br/><b>${escapeHtml(noValue)}</b></div>` : ''}
  </div>
  ${body}
  <div class="doc-foot">${escapeHtml(footer)}</div>
</div></body></html>`;
}

// ---------- 提单（英文为主，接近真实海运提单） ----------
function renderBl(bizData) {
  const o = bizData.order || {};
  const b = bizData.booking || {};
  const shipper = [o.shipperName, o.shipperAddress].filter(Boolean).join('\n');
  const consignee = [o.consigneeName, o.consigneeAddress].filter(Boolean).join('\n');
  const notify = o.notifyParty || '';
  const blNo = (o.orderNo || b.bookingNo || '').replace(/\s+/g, '');
  const carrier = b.supplier?.name || o.customer?.name || '';
  const vessel = [b.vesselName, b.voyageNo].filter(Boolean).join(' / ');
  const pol = o.placeOfReceipt || o.originPort || '';
  const pod = o.destPort || '';
  const delivery = o.placeOfDelivery || '';
  const marks = o.marksNumbers || '';
  const packages = o.packageCount != null ? o.packageCount : '';
  const desc = o.cargoDesc || '';
  const weight = o.cargoWeight != null ? o.cargoWeight : '';
  const volume = o.cargoVolume != null ? o.cargoVolume : '';
  const container = o.containerNo || '';
  const freight = o.freightCharges || '';
  const original = o.originalBLCount != null ? o.originalBLCount : 3;
  const telex = o.telexRelease ? 'TELEX RELEASE' : '';
  const etd = o.etd || '';
  const eta = o.eta || '';

  const body = `
  <div class="bl-watermark">ORIGINAL</div>
  <table class="party"><tr>
    <td style="width:50%;"><div class="lbl">SHIPPER</div><div class="val">${lines(shipper)}</div></td>
    <td style="width:50%;"><div class="lbl">CONSIGNEE</div><div class="val">${lines(consignee)}</div></td>
  </tr><tr>
    <td colspan="2"><div class="lbl">NOTIFY PARTY</div><div class="val">${lines(notify)}</div></td>
  </tr></table>

  <table class="route"><tr>
    <td><div class="lbl">VESSEL / VOYAGE</div><div class="val">${escapeHtml(vessel)}</div></td>
    <td><div class="lbl">PORT OF LOADING</div><div class="val">${escapeHtml(pol)}</div></td>
    <td><div class="lbl">PORT OF DISCHARGE</div><div class="val">${escapeHtml(pod)}</div></td>
    <td><div class="lbl">PLACE OF DELIVERY</div><div class="val">${escapeHtml(delivery)}</div></td>
  </tr></table>

  <table class="cargo">
    <thead><tr>
      <th style="width:22%;">MARKS &amp; NOS.</th>
      <th style="width:14%;">NO. OF PKGS</th>
      <th style="width:36%;">DESCRIPTION OF GOODS</th>
      <th style="width:14%;">GROSS WEIGHT</th>
      <th style="width:14%;">MEASUREMENT</th>
    </tr></thead>
    <tbody><tr>
      <td class="val">${lines(marks)}</td>
      <td class="val">${escapeHtml(packages)}</td>
      <td class="val">${lines(desc)}</td>
      <td class="val">${escapeHtml(weight)}</td>
      <td class="val">${escapeHtml(volume)}</td>
    </tr></tbody>
  </table>

  <div class="info-row">
    <div class="item"><b>CONTAINER NO.</b>${escapeHtml(container)}</div>
    <div class="item"><b>FREIGHT</b>${escapeHtml(freight)}</div>
    <div class="item"><b>ORIGINAL B/L</b>${escapeHtml(original)}</div>
    <div class="item"><b>ETD</b>${escapeHtml(etd)}</div>
    <div class="item"><b>ETA</b>${escapeHtml(eta)}</div>
    ${telex ? `<div class="item"><b>RELEASE</b>${escapeHtml(telex)}</div>` : ''}
  </div>

  <div class="sign-row">
    <div class="sign"><div class="line"></div>DATE OF ISSUE</div>
    <div class="sign"><div class="line"></div>SIGNED FOR THE CARRIER</div>
  </div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<style>
  @page{size:A4;margin:0;}
  *{box-sizing:border-box;}
  body{font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',-apple-system,sans-serif;color:#111;margin:0;padding:0;}
  .bl{width:100%;padding:26px 30px;position:relative;}
  .bl-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px;}
  .bl-head .carrier{font-size:17px;font-weight:700;letter-spacing:0.5px;width:26%;word-break:keep-all;line-height:1.4;}
  .bl-head .bl-title{font-size:30px;font-weight:800;letter-spacing:6px;text-align:center;width:38%;}
  .bl-head .bl-no{font-size:12px;text-align:right;width:36%;line-height:1.6;}
  .bl-head .bl-no b{font-size:14px;letter-spacing:0.5px;word-break:keep-all;white-space:nowrap;}
  table.party{width:100%;border-collapse:collapse;margin-bottom:12px;}
  table.party td{border:1px solid #333;padding:8px 10px;vertical-align:top;font-size:13px;height:64px;}
  table.party .lbl{font-size:11px;color:#444;font-weight:600;letter-spacing:1px;margin-bottom:4px;}
  table.party .val{white-space:pre-line;line-height:1.5;font-size:13px;}
  table.route{width:100%;border-collapse:collapse;margin-bottom:12px;}
  table.route td{border:1px solid #333;padding:8px 10px;vertical-align:top;font-size:12px;width:25%;}
  table.route .lbl{font-size:10px;color:#444;font-weight:600;letter-spacing:0.5px;margin-bottom:3px;}
  table.route .val{font-size:12px;line-height:1.5;}
  table.cargo{width:100%;border-collapse:collapse;margin-bottom:12px;}
  table.cargo th,table.cargo td{border:1px solid #333;padding:8px 10px;font-size:12px;vertical-align:top;}
  table.cargo th{background:#f0f0f0;font-size:11px;letter-spacing:0.5px;text-align:left;}
  table.cargo td.val{white-space:pre-line;line-height:1.5;}
  .info-row{display:flex;flex-wrap:wrap;gap:8px 26px;font-size:12px;margin-bottom:10px;padding:6px 2px;}
  .info-row .item b{display:block;font-size:10px;color:#444;letter-spacing:0.5px;margin-bottom:2px;}
  .sign-row{display:flex;justify-content:space-between;margin-top:44px;font-size:12px;}
  .sign-row .sign{width:40%;}
  .sign-row .line{border-bottom:1px solid #333;height:34px;margin-bottom:6px;}
  .bl-watermark{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:100px;font-weight:800;color:rgba(0,0,0,0.06);letter-spacing:20px;pointer-events:none;z-index:0;}
  .bl>*{position:relative;z-index:1;}
  @media print{body{-webkit-print-color-adjust:exact;}}
</style></head><body><div class="bl">
  <div class="bl-head">
    <div class="carrier">${escapeHtml(carrier)}</div>
    <div class="bl-title">BILL OF LADING</div>
    <div class="bl-no">B/L No.<br/><b>${escapeHtml(blNo)}</b></div>
  </div>
  ${body}
</div></body></html>`;
}

// ---------- 对账单 ----------
function renderStatement(bizData) {
  const s = bizData.statementSummary || {};
  const customer = bizData.order?.customer?.name || '';
  const fin = bizData.finance || [];
  const rows = fin.map((f) => {
    const isRecv = f.direction === 'receivable';
    const recv = isRecv ? f.amount : '';
    const pay = !isRecv ? f.amount : '';
    const paid = f.paidAmount != null ? f.paidAmount : '';
    const statusMap = { unpaid: '未结', partial: '部分结', paid: '已结', waived: '核销' };
    return `<tr>
      <td>${escapeHtml(fmtDate(f.createdAt))}</td>
      <td>${escapeHtml(f.description || f.category || '')}</td>
      <td class="num">${fmtMoney(recv)}</td>
      <td class="num">${fmtMoney(pay)}</td>
      <td class="num">${fmtMoney(paid)}</td>
      <td>${escapeHtml(statusMap[f.status] || f.status || '')}</td>
    </tr>`;
  }).join('');
  const period = `${s.periodFrom || ''} ~ ${s.periodTo || ''}`;

  const body = `
  <table class="meta">
    <tr>
      <td style="width:50%;"><div class="lbl">客户名称</div><div class="val">${escapeHtml(customer)}</div></td>
      <td style="width:50%;"><div class="lbl">对账期间</div><div class="val">${escapeHtml(period)}</div></td>
    </tr>
  </table>

  <table class="summary">
    <tr>
      <td><div class="lbl">期初应收</div><div class="val">${fmtMoney(s.openingReceivable)}</div></td>
      <td><div class="lbl">本期应收</div><div class="val">${fmtMoney(s.periodReceivable)}</div></td>
      <td><div class="lbl">本期已收</div><div class="val">${fmtMoney(s.received)}</div></td>
      <td><div class="lbl">未收余额</div><div class="val">${fmtMoney(s.receivableBalance)}</div></td>
      <td><div class="lbl">未付余额</div><div class="val">${fmtMoney(s.payableBalance)}</div></td>
    </tr>
  </table>

  <table class="detail">
    <thead><tr>
      <th style="width:13%;">日期</th>
      <th>费用描述</th>
      <th style="width:13%;" class="num">应收</th>
      <th style="width:13%;" class="num">应付</th>
      <th style="width:13%;" class="num">已收/已付</th>
      <th style="width:10%;">状态</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#999;">本期无费用明细</td></tr>`}</tbody>
  </table>

  <div class="sign-row">
    <div class="sign"><div class="line"></div>客户确认（盖章）</div>
    <div class="sign"><div class="line"></div>本公司（盖章）</div>
  </div>`;

  return pageShell('对账单', 'STATEMENT OF ACCOUNT', '账单号', s.statementNo || '', body, { footer: '本对账单由货代管理系统生成，请核对后盖章确认' });
}

// ---------- 发票 ----------
function renderInvoice(bizData) {
  const inv = bizData.invoice || {};
  const customer = inv.customer?.name || '';
  const supplier = inv.supplier?.name || '';
  const orderNo = inv.order?.orderNo || '';
  const typeMap = { payable: '应付发票', receivable: '应收发票' };
  const type = typeMap[inv.invoiceType] || inv.invoiceType || '';
  const statusMap = { draft: '草稿', issued: '已开票', paid: '已付款', cancelled: '已作废' };
  const status = statusMap[inv.status] || inv.status || '';

  // 解析开票明细行
  let items = [];
  try {
    const parsed = typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items;
    if (Array.isArray(parsed)) items = parsed;
  } catch { items = []; }
  const rows = items.map((it) => `<tr>
    <td>${escapeHtml(it.description || '')}</td>
    <td class="num">${fmtMoney(it.amount)}</td>
  </tr>`).join('');

  const body = `
  <table class="meta">
    <tr>
      <td style="width:50%;"><div class="lbl">${inv.invoiceType === 'payable' ? '供应商' : '客户'}</div><div class="val">${escapeHtml(inv.invoiceType === 'payable' ? supplier : customer)}</div></td>
      <td style="width:25%;"><div class="lbl">开票日期</div><div class="val">${escapeHtml(fmtDate(inv.issuedAt))}</div></td>
      <td style="width:25%;"><div class="lbl">状态</div><div class="val">${escapeHtml(status)}</div></td>
    </tr>
    <tr>
      <td><div class="lbl">发票类型</div><div class="val">${escapeHtml(type)}</div></td>
      <td><div class="lbl">关联订单</div><div class="val">${escapeHtml(orderNo)}</div></td>
      <td><div class="lbl">币种</div><div class="val">${escapeHtml(inv.currency || '')}</div></td>
    </tr>
  </table>

  <table class="detail">
    <thead><tr><th>费用项目</th><th style="width:22%;" class="num">金额</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="2" style="text-align:center;color:#999;">无明细</td></tr>`}</tbody>
  </table>

  <table class="amount">
    <tr><td class="lbl">不含税金额</td><td class="num">${fmtMoney(inv.amount)}</td></tr>
    <tr><td class="lbl">税率</td><td class="num">${inv.taxRate != null ? escapeHtml(inv.taxRate) + '%' : ''}</td></tr>
    <tr><td class="lbl">税额</td><td class="num">${fmtMoney(inv.taxAmount)}</td></tr>
    <tr class="total-row"><td class="lbl">含税总额</td><td class="num">${fmtMoney(inv.totalAmount)}</td></tr>
  </table>`;

  return pageShell('发票', 'INVOICE', '发票号', inv.invoiceNo || '', body, { footer: '本发票由货代管理系统生成' });
}

// ---------- 费用通知单 ----------
function renderDebitNote(bizData) {
  const o = bizData.order || {};
  const b = bizData.booking || {};
  const fin = bizData.finance || [];
  const customer = o.customer?.name || '';
  const vessel = [b.vesselName, b.voyageNo].filter(Boolean).join(' / ');
  const rows = fin.map((f) => {
    const isRecv = f.direction === 'receivable';
    const statusMap = { unpaid: '未结', partial: '部分结', paid: '已结', waived: '核销' };
    return `<tr>
      <td>${escapeHtml(fmtDate(f.createdAt))}</td>
      <td>${escapeHtml(f.description || f.category || '')}</td>
      <td>${escapeHtml(isRecv ? '应收' : '应付')}</td>
      <td class="num">${fmtMoney(f.amount)}</td>
      <td class="num">${fmtMoney(f.paidAmount)}</td>
      <td>${escapeHtml(statusMap[f.status] || f.status || '')}</td>
    </tr>`;
  }).join('');
  const total = fin.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const body = `
  <table class="meta">
    <tr>
      <td style="width:34%;"><div class="lbl">客户名称</div><div class="val">${escapeHtml(customer)}</div></td>
      <td style="width:33%;"><div class="lbl">订单号</div><div class="val">${escapeHtml(o.orderNo || '')}</div></td>
      <td style="width:33%;"><div class="lbl">船名 / 航次</div><div class="val">${escapeHtml(vessel)}</div></td>
    </tr>
    <tr>
      <td><div class="lbl">起运港</div><div class="val">${escapeHtml(o.originPort || '')}</div></td>
      <td><div class="lbl">目的港</div><div class="val">${escapeHtml(o.destPort || '')}</div></td>
      <td><div class="lbl">货描</div><div class="val">${escapeHtml(o.cargoDesc || '')}</div></td>
    </tr>
  </table>

  <table class="detail">
    <thead><tr>
      <th style="width:13%;">日期</th>
      <th>费用描述</th>
      <th style="width:10%;">方向</th>
      <th style="width:14%;" class="num">金额</th>
      <th style="width:14%;" class="num">已收/已付</th>
      <th style="width:10%;">状态</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;color:#999;">无费用明细</td></tr>`}
    <tr class="total-row"><td colspan="3">合计</td><td class="num">${fmtMoney(total)}</td><td></td><td></td></tr></tbody>
  </table>

  <div class="sign-row">
    <div class="sign"><div class="line"></div>制单人</div>
    <div class="sign"><div class="line"></div>客户签收</div>
  </div>`;

  return pageShell('费用通知单', 'DEBIT NOTE', '订单号', o.orderNo || '', body, { footer: '本费用通知单由货代管理系统生成' });
}

// ---------- 分发入口 ----------
function renderBuiltinHTML(docType, bizData) {
  switch (docType) {
    case 'bl': return renderBl(bizData);
    case 'statement': return renderStatement(bizData);
    case 'invoice': return renderInvoice(bizData);
    case 'debit_note': return renderDebitNote(bizData);
    default: return null;
  }
}

module.exports = { supports, renderBuiltinHTML };
