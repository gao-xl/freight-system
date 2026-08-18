'use strict';

// P2-3a 财务凭证导出服务
// ---------------------------------------------------------------------------
// 将系统费用流水（FinanceRecord）按会计期间/业务对象聚合为「标准会计凭证」，
// 支持两类输出格式，供导入金蝶云星空 / 用友 U8：
//   - JSON  → 金蝶云星空 凭证导入规范（辅助核算：客户/供应商/订单/币种）
//   - XML   → 用友 U8  凭证导入规范（<zdb/> 凭证行）
//
// 科目映射规则由 费用类别 → (应收科目/应付科目/收入科目/成本科目) 字典定义，
// 常量表内置于本文件，可按企业实际科目表调整（一次配置、多处复用）。

const { FinanceRecord, Order, Customer, Supplier } = require('../services/dataAccess');
const { Op } = require('sequelize');

// 费用类别 → 科目编码/名称（收入端借方/成本端贷方的费用科目）
const CATEGORY_ACCOUNT = {
  ocean_freight:  { code: '6001', name: '海运费收入', costCode: '6401', costName: '海运费成本' },
  air_freight:    { code: '6001', name: '空运费收入', costCode: '6401', costName: '空运费成本' },
  local_charge:   { code: '6002', name: '港口杂费收入', costCode: '6402', costName: '港口杂费成本' },
  customs_fee:    { code: '6003', name: '报关费收入', costCode: '6403', costName: '报关费成本' },
  document_fee:   { code: '6004', name: '单证费收入', costCode: '6404', costName: '单证费成本' },
  warehouse_fee:  { code: '6005', name: '仓储费收入', costCode: '6405', costName: '仓储费成本' },
  transport_fee:  { code: '6006', name: '内陆运费收入', costCode: '6406', costName: '内陆运费成本' },
  other:          { code: '6051', name: '其他业务收入', costCode: '6451', costName: '其他业务成本' },
};

// 应收/应付往来科目
const ACCOUNT_RECEIVABLE = { code: '1122', name: '应收账款' };
const ACCOUNT_PAYABLE = { code: '2202', name: '应付账款' };

// 依据方向取收入科目或成本科目
function feeAccount(category, direction) {
  const def = CATEGORY_ACCOUNT[category] || CATEGORY_ACCOUNT.other;
  if (direction === 'receivable') return { code: def.code, name: def.name, kind: 'revenue' };
  return { code: def.costCode, name: def.costName, kind: 'cost' };
}

// 查询区间内费用流水（默认按 settleMonth 过滤，否则按 createdAt）
async function queryFinance({ from, to, customerId, supplierId, direction }) {
  const where = {};
  if (from || to) {
    where[Op.or] = [
      { settleMonth: { [Op.ne]: null } },
      { settleMonth: { [Op.eq]: null } },
    ];
    if (from) {
      where[Op.and] = [{ [Op.or]: [
        { settleMonth: { [Op.gte]: from, [Op.lte]: to || '9999-12-31' } },
        { [Op.and]: [{ settleMonth: null }, { createdAt: { [Op.gte]: new Date(`${from}T00:00:00Z`), [Op.lte]: to ? new Date(`${to}T23:59:59Z`) : new Date() } }] },
      ] }];
    }
  }
  if (customerId) where.counterpartyId = customerId;
  if (supplierId) where.counterpartyId = supplierId;
  if (direction) where.direction = direction;
  const rows = await FinanceRecord.findAll({ where, order: [['settleMonth', 'ASC'], ['id', 'ASC']] });
  return rows;
}

// 按 会计期间 + 方向 聚合成一张张凭证
async function buildVouchers({ from, to, customerId, supplierId, direction } = {}) {
  const rows = await queryFinance({ from, to, customerId, supplierId, direction });
  const vouchers = new Map(); // key: `${settleMonth}|${direction}`
  for (const r of rows) {
    const period = (r.settleMonth || r.createdAt).toString().slice(0, 7);
    const key = `${period}|${r.direction}`;
    if (!vouchers.has(key)) {
      vouchers.set(key, {
        period, direction: r.direction,
        no: `V${period.replace('-', '')}${r.direction === 'receivable' ? 'R' : 'P'}`,
        date: (r.settleMonth || r.createdAt).toString().slice(0, 10),
        summary: r.direction === 'receivable' ? '确认应收收入' : '确认应付款',
        lines: [], total: 0,
      });
    }
    const v = vouchers.get(key);
    const fee = feeAccount(r.category, r.direction);
    // 借/贷：应收→ 借费用科目(+收入)，贷应收账款；应付→ 借营业成本，贷应付账款
    const amount = Number(r.amount) || 0;
    // 本币折算优先；未折算或无有效值时回退原币金额，避免 NaN 写入凭证
    const localAmount = r.localAmount != null && Number(r.localAmount) !== 0 && !Number.isNaN(Number(r.localAmount))
      ? Number(r.localAmount) : amount;
    const party = {
      id: r.counterpartyId,
      type: r.direction === 'receivable' ? 'customer' : 'supplier',
      code: r.description || '',
    };
    v.lines.push({
      summary: r.description || `${fee.name}（${r.category}）`,
      account: fee.code, accountName: fee.name,
      debit: r.direction === 'receivable' ? localAmount : 0,
      credit: r.direction === 'payable' ? localAmount : 0,
      currency: r.currency || 'CNY',
      originalAmount: amount, exchangeRate: Number(r.exchangeRate) || 1,
      orderNo: String(r.orderId || ''),
      partyType: party.type, partyId: party.id,
    });
    // 对应往来科目贷/借行
    const receivable = party.type === 'customer';
    v.lines.push({
      summary: `应付${receivable ? '' : ''}${party.type === 'customer' ? '客户' : '供应商'}往来`,
      account: receivable ? ACCOUNT_RECEIVABLE.code : ACCOUNT_PAYABLE.code,
      accountName: receivable ? ACCOUNT_RECEIVABLE.name : ACCOUNT_PAYABLE.name,
      debit: receivable ? 0 : localAmount,
      credit: receivable ? localAmount : 0,
      currency: r.currency || 'CNY',
      originalAmount: amount, exchangeRate: Number(r.exchangeRate) || 1,
      orderNo: String(r.orderId || ''),
      partyType: party.type, partyId: party.id,
    });
    v.total += localAmount;
  }
  return [...vouchers.values()].map((v) => ({ ...v, total: Number(v.total.toFixed(2)) }));
}

// 金蝶云星空 JSON 凭证格式
function toKingdeeJSON(vouchers) {
  const head = {
    appId: 'e8732b76-3828-4a76-9f5b-5a07c3a36d99',
    version: '1.0',
    context: { UserName: 'freight-sys', AppName: 'K3Cloud' },
    operation: { name: 'Save', handleSign: 'true' },
  };
  const models = vouchers.map((v) => ({
    Model: {
      Numbers: v.no,
      FiscalPeriod: v.period.replace('-', '.'),
      Date: v.date,
      VoucherType: v.direction === 'receivable' ? { FNumber: 'REC' } : { FNumber: 'PAY' },
      Attachments: '货代系统凭证同步',
      Entry: v.lines.map((l) => ({
        Summary: l.summary,
        Amount: l.debit || l.credit,
        Dc: l.debit > 0 ? 'D' : 'C',
        AccountID: { FNumber: l.account },
        CurrencyID: { FNumber: l.currency },
        ExchangeRate: l.exchangeRate,
        CustomEntity: {
          F_XX_OrderNo: l.orderNo,
          ...(l.partyType === 'customer'
            ? { F_XX_Customer: { FNumber: l.partyId } }
            : { F_XX_Supplier: { FNumber: l.partyId } }),
        },
      })),
    },
  }));
  return { ...head, Models: models };
}

// XML 实体转义
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// 用友 U8 XML 凭证格式
function toYonyouXML(vouchers) {
  const head = `<?xml version="1.0" encoding="gb2312"?><ufinterface roottag="voucher" billtype="gl">`;
  const docNo = new Date().toISOString().slice(0, 10);
  const body = `<voucher><head><uaccount>${esc(process.env.U8_ACCOUNT || 'freight')}</uaccount><uname>freight-sys</uname><dbpw></dbpw><cdept>货代</cdept><ddate>${esc(docNo)}</ddate></head>`;
  const entries = vouchers.map((v) => {
    const lines = v.lines.map((l) =>
      `<entry><zdb_0>${esc(l.summary)}</zdb_0><zdb_1>待核销</zdb_1><zdb_2>${l.debit > 0 ? '1' : '0'}</zdb_2><zdb_3>${esc(l.account)}</zdb_3><zdb_4>${l.debit || l.credit}</zdb_4><zdb_5>${l.debit > 0 ? esc(l.currency) : ''}</zdb_5><zdb_6>0</zdb_6><zdb_7>${l.debit > 0 ? '' : esc(l.currency)}</zdb_7><zdb_8>0</zdb_8></entry>`).join('');
    return `<voucher><head><id1>${esc(v.no)}</id1><orig1>货代系统</orig1><ddate>${esc(v.date)}</ddate><category>${v.direction === 'receivable' ? '收款凭证' : '付款凭证'}</category></head><entry>${lines}</entry></voucher>`;
  }).join('');
  return `${head}${body}${entries}</ufinterface>`;
}

// 汇总统计（供导出接口返回）
function summarize(vouchers) {
  return {
    count: vouchers.length,
    total: Number(vouchers.reduce((s, v) => s + v.total, 0).toFixed(2)),
    receivable: Number(vouchers.filter((v) => v.direction === 'receivable').reduce((s, v) => s + v.total, 0).toFixed(2)),
    payable: Number(vouchers.filter((v) => v.direction === 'payable').reduce((s, v) => s + v.total, 0).toFixed(2)),
  };
}

module.exports = { buildVouchers, toKingdeeJSON, toYonyouXML, summarize, CATEGORY_ACCOUNT };