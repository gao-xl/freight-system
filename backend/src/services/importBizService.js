// Excel 批量导入业务配置与行级校验（客户/供应商/订单）
// 职责：定义各业务类型的表头/示例/校验逻辑，以及模板生成、编码分配、数据库错误转友好文案。
// 与控制器分离：控制器只做「解析 -> 逐行校验 -> 事务写入 -> 汇总」，具体业务规则都收敛在本文件。
const XLSX = require('xlsx');
const { Op } = require('sequelize');
const { Customer, Supplier, Order } = require('../models');
const { genCode } = require('../utils/response');
const { cleanStr } = require('./importService');

// 按表头取列值：兼容模板表头带提示后缀的写法
// 例：期望列 "客户名称"，文件表头为 "客户名称（填系统中已存在的客户）"，也能取到值
function pick(row, baseHeader) {
  if (row[baseHeader] !== undefined && row[baseHeader] !== null) return row[baseHeader];
  const key = Object.keys(row).find((k) => k.startsWith(baseHeader));
  return key ? row[key] : '';
}

// 规范化一行：去掉表头键的多余空白，避免手工编辑表头产生空格导致匹配失败
function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = cleanStr(k);
    if (key) out[key] = v;
  }
  return out;
}

// 日期解析：兼容 Date 对象 / Excel 序列号 / 多种文本格式
// 返回 { ok: true, value: 'YYYY-MM-DD' | null } 或 { ok: false }
function parseExcelDate(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false };
    return { ok: true, value: fmtDate(v.getFullYear(), v.getMonth() + 1, v.getDate()) };
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel 日期序列号：以 1899-12-30 为起算点
    const d = new Date(Math.round((v - 25569) * 86400000));
    if (Number.isNaN(d.getTime())) return { ok: false };
    return { ok: true, value: fmtDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
  }
  const s = cleanStr(v);
  if (!s) return { ok: true, value: null };
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!isRealDate(y, mo, d)) return { ok: false };
    return { ok: true, value: fmtDate(y, mo, d) };
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return { ok: false };
  const dt = new Date(t);
  return { ok: true, value: fmtDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()) };
}

function isRealDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, mo - 1, d);
  return check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === d;
}

function fmtDate(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 生成不重复编码（文件内去重）
function genUniqueCode(seen, prefix) {
  let code;
  do { code = genCode(prefix); } while (seen.has(code));
  seen.add(code);
  return code;
}

// 为有效行分配业务编码（客户/供应商），并核对库中已占用编码，避免唯一约束冲突
async function ensureCodes(cfg, validRows) {
  if (!cfg.hasCode || !validRows.length) return;
  const seen = new Set();
  const candidate = validRows.map((v) => ({ v, code: genUniqueCode(seen, cfg.codePrefix) }));
  const occupied = new Set(
    (await cfg.model.findAll({ where: { code: { [Op.in]: candidate.map((c) => c.code) } }, attributes: ['code'] }))
      .map((x) => String(x.code))
  );
  for (const c of candidate) {
    while (occupied.has(c.code)) c.code = genUniqueCode(seen, cfg.codePrefix);
    occupied.add(c.code);
    c.v.data.code = c.code;
  }
}

// 数据库写入异常转成对用户友好的文案（唯一约束/校验错误不暴露 SQL 细节）
function friendlyDbError(e, cfg) {
  const name = e && e.name;
  if (name === 'SequelizeUniqueConstraintError') return cfg.uniqueMsg;
  if (name === 'SequelizeValidationError') {
    const msgs = (e.errors || []).map((x) => x.message).filter(Boolean);
    return msgs.length ? msgs.join('；') : '数据校验失败';
  }
  if (name === 'SequelizeForeignKeyConstraintError') return '关联数据不存在';
  if (/unique/i.test(String((e && e.message) || ''))) return cfg.uniqueMsg;
  return '数据库写入失败';
}

// 生成模板 Excel buffer：表头 + 中文示例行
function buildTemplateBuffer(cfg) {
  const aoa = [cfg.headers.map((h) => h.header)];
  for (const ex of cfg.examples) {
    aoa.push(cfg.headers.map((h) => (ex[h.key] !== undefined && ex[h.key] !== null ? ex[h.key] : '')));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cfg.headers.map((h) => ({ wch: h.width || Math.max(h.header.length + 4, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 各业务类型的导入配置与行级校验
const BIZ_CONFIG = {
  customer: {
    biz: 'customer',
    module: 'customer',
    model: Customer,
    hasCode: true,
    codePrefix: 'CUS',
    uniqueField: 'name',
    uniqueMsg: '客户名已存在',
    uniqueColumn: '客户名称',
    sheetName: '客户导入',
    headers: [
      { key: 'name', header: '客户名称', width: 32 },
      { key: 'contact', header: '联系人', width: 12 },
      { key: 'phone', header: '电话', width: 16 },
      { key: 'email', header: '邮箱', width: 28 },
    ],
    examples: [
      { name: '示例客户A（导入前请删除本行）', contact: '张三', phone: '13800138000', email: 'demo-a@example.com' },
      { name: '示例客户B（导入前请删除本行）', contact: '李四', phone: '13900139000', email: 'demo-b@example.com' },
    ],
    validate(row, ctx, existingSet) {
      const name = cleanStr(pick(row, '客户名称'));
      if (!name) return { ok: false, message: '缺少客户名称' };
      if (ctx.seen.has(name)) return { ok: false, message: '客户名已存在' };
      ctx.seen.add(name);
      if (existingSet.has(name)) return { ok: false, message: '客户名已存在' };
      return {
        ok: true,
        data: {
          name,
          contact: cleanStr(pick(row, '联系人')) || null,
          phone: cleanStr(pick(row, '电话')) || null,
          email: cleanStr(pick(row, '邮箱')) || null,
          status: 'active',
          groupId: ctx.groupId,
          ownerId: ctx.ownerId,
        },
      };
    },
  },

  supplier: {
    biz: 'supplier',
    module: 'supplier',
    model: Supplier,
    hasCode: true,
    codePrefix: 'SUP',
    uniqueField: 'name',
    uniqueMsg: '供应商名已存在',
    uniqueColumn: '供应商名称',
    sheetName: '供应商导入',
    headers: [
      { key: 'name', header: '供应商名称', width: 32 },
      { key: 'contact', header: '联系人', width: 12 },
      { key: 'phone', header: '电话', width: 16 },
      { key: 'email', header: '邮箱', width: 28 },
    ],
    examples: [
      { name: '示例船公司A（导入前请删除本行）', contact: '王五', phone: '13700137000', email: 'svc-a@example.com' },
      { name: '示例报关行B（导入前请删除本行）', contact: '赵六', phone: '13600136000', email: 'svc-b@example.com' },
    ],
    validate(row, ctx, existingSet) {
      const name = cleanStr(pick(row, '供应商名称'));
      if (!name) return { ok: false, message: '缺少供应商名称' };
      if (ctx.seen.has(name)) return { ok: false, message: '供应商名已存在' };
      ctx.seen.add(name);
      if (existingSet.has(name)) return { ok: false, message: '供应商名已存在' };
      return {
        ok: true,
        data: {
          name,
          contact: cleanStr(pick(row, '联系人')) || null,
          phone: cleanStr(pick(row, '电话')) || null,
          email: cleanStr(pick(row, '邮箱')) || null,
          status: 'active',
          groupId: ctx.groupId,
          ownerId: ctx.ownerId,
        },
      };
    },
  },

  order: {
    biz: 'order',
    module: 'order',
    model: Order,
    hasCode: false,
    uniqueField: 'orderNo',
    uniqueMsg: '订单号已存在',
    uniqueColumn: '订单号',
    sheetName: '订单导入',
    headers: [
      { key: 'orderNo', header: '订单号', width: 20 },
      { key: 'customerName', header: '客户名称（填系统中已存在的客户）', width: 34 },
      { key: 'etd', header: '预计发运（YYYY-MM-DD）', width: 20 },
      { key: 'eta', header: '预计到港（YYYY-MM-DD）', width: 20 },
    ],
    examples: [
      { orderNo: 'SO20260101001', customerName: '示例客户A（导入前请删除本行）', etd: '2026-01-10', eta: '2026-01-20' },
      { orderNo: 'SO20260101002', customerName: '示例客户B（导入前请删除本行）', etd: '2026-02-05', eta: '2026-02-15' },
    ],
    validate(row, ctx, existingSet) {
      const orderNo = cleanStr(pick(row, '订单号'));
      if (!orderNo) return { ok: false, message: '缺少订单号' };
      if (ctx.seen.has(orderNo)) return { ok: false, message: '订单号已存在' };
      ctx.seen.add(orderNo);
      if (existingSet.has(orderNo)) return { ok: false, message: '订单号已存在' };
      const customerName = cleanStr(pick(row, '客户名称'));
      if (!customerName) return { ok: false, message: '缺少客户名称' };
      const customerId = ctx.customerMap ? ctx.customerMap.get(customerName) : undefined;
      if (!customerId) return { ok: false, message: `客户不存在：${customerName}` };
      const etd = parseExcelDate(pick(row, '预计发运'));
      if (!etd.ok) return { ok: false, message: '预计发运日期格式不正确' };
      const eta = parseExcelDate(pick(row, '预计到港'));
      if (!eta.ok) return { ok: false, message: '预计到港日期格式不正确' };
      return {
        ok: true,
        data: {
          orderNo,
          customerId,
          etd: etd.value,
          eta: eta.value,
          groupId: ctx.groupId,
          ownerId: ctx.ownerId,
        },
      };
    },
  },
};

module.exports = {
  BIZ_CONFIG,
  pick,
  normalizeRow,
  parseExcelDate,
  ensureCodes,
  friendlyDbError,
  buildTemplateBuffer,
};
