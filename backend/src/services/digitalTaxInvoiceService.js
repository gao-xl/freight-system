'use strict';

// 数电票（全面数字化电子发票）批量导入文件生成服务
//
// 依据：国家税务总局《电子发票服务平台批量开票操作指引》
// 生成 4 工作表 Excel（.xlsx），可通过电子税务局网页端"批量开票"功能导入。
//
// 工作表结构：
//   1. 发票基本信息  — 每张发票 1 行（购方/销方/备注/价税合计等）
//   2. 发票明细信息  — 每行商品 1 行（项目名称/编码/金额/税率/税额）
//   3. 特定业务信息  — 货物运输服务等 5 类特定业务的结构化字段
//   4. 附加要素信息  — 自定义附加要素（可选）
//
// 关键规则：
//   - 第一页与第二页通过"发票流水号"(dklsh) 关联，相同流水号的明细行合并到同一张发票
//   - 备注栏上限 200 字符（中文=3 字符，ASCII=1 字符）
//   - 货物运输服务的起运地/到达地/运输工具种类/牌号/货物名称填写在第三页（非备注栏）
//   - 税收分类编码为 19 位数字，必填
//   - 税率以小数填写（如 0.09 = 9%）

const ExcelJS = require('exceljs');
const { logger } = require('../utils/logger');

// ===== 税收分类编码映射（基于 FinanceRecord.category）=====
// 19 位编码：首位 3=服务，301=交通运输服务，302=装卸搬运，304=现代服务
const TAX_CODE_MAP = {
  ocean_freight:   { code: '3010102010000000000', name: '*货物运输服务*国际海上货物运输', transport: '水路运输' },
  air_freight:     { code: '3010103010000000000', name: '*货物运输服务*航空货物运输',    transport: '航空运输' },
  transport_fee:   { code: '3010101010000000000', name: '*货物运输服务*陆路货物运输',    transport: '公路运输' },
  local_charge:    { code: '3020100000000000000', name: '*物流辅助服务*装卸搬运',        transport: null },
  customs_fee:     { code: '3040102000000000000', name: '*经纪代理服务*报关代理',        transport: null },
  document_fee:    { code: '3040600000000000000', name: '*咨询服务*其他咨询服务',        transport: null },
  warehouse_fee:   { code: '3040401000000000000', name: '*物流辅助服务*仓储服务',        transport: null },
  other:           { code: '3049900000000000000', name: '*现代服务*其他现代服务',        transport: null },
};

// 运输方式 → 运输工具种类映射
const TRANSPORT_MODE_MAP = {
  sea:  '水路运输',
  air:  '航空运输',
  land: '公路运输',
  rail: '铁路运输',
};

// 发票类型代码
const INVOICE_TYPE = {
  DIGITAL_NORMAL: '82',    // 数电普票
  DIGITAL_SPECIAL: '81',   // 数电专票
};

// 含税标志
const HS_FLAG = {
  EXCLUDE: '0',  // 不含税
  INCLUDE: '1',  // 含税
};

// ===== 工具函数 =====

/**
 * 备注栏字符计数（数电票规则：中文=3 字符，ASCII=1 字符，上限 200）
 */
function countRemarkChars(str) {
  if (!str) return 0;
  let count = 0;
  for (const ch of String(str)) {
    // CJK 统一汉字 + 全角标点/符号 按 3 字符计算
    count += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 3 : 1;
  }
  return count;
}

/**
 * 生成发票流水号（dklsh），唯一标识一张发票
 * 格式：DK + 时间戳后10位 + 发票ID补零4位 + 序号补零2位
 */
function genDklsh(invoiceId, index) {
  const ts = Date.now().toString().slice(-10);
  return `DK${ts}${String(invoiceId).padStart(4, '0')}${String(index).padStart(2, '0')}`;
}

/**
 * 根据费用类别获取税收编码信息
 */
function getTaxInfo(category) {
  return TAX_CODE_MAP[category] || TAX_CODE_MAP.other;
}

/**
 * 校验单张发票数据，返回错误消息数组（空数组=通过）
 */
function validateInvoice(inv) {
  const errors = [];

  // 购方名称必填
  if (!inv.buyer || !inv.buyer.name || !inv.buyer.name.trim()) {
    errors.push('购方名称不能为空');
  }

  // 购方税号格式校验（如填则须 15 或 18 位）
  if (inv.buyer && inv.buyer.taxNo) {
    const taxNo = String(inv.buyer.taxNo).trim();
    if (!/^[A-Z0-9]{15}$|^[A-Z0-9]{18}$/.test(taxNo)) {
      errors.push('购方税号应为 15 或 18 位字母数字');
    }
  }

  // 明细金额必须 > 0
  const items = inv.items || [];
  if (!items.length) {
    errors.push('至少需要一条明细行');
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.spmc || !item.spmc.trim()) {
      errors.push(`第 ${i + 1} 行项目名称不能为空`);
    }
    if (!item.spbm || !/^\d{19}$/.test(String(item.spbm))) {
      errors.push(`第 ${i + 1} 行税收分类编码应为 19 位数字`);
    }
    const je = Number(item.je ?? item.amount ?? 0);
    if (!je || je <= 0) {
      errors.push(`第 ${i + 1} 行金额必须大于 0`);
    }
  }

  // 备注栏字符数校验
  if (inv.remark && countRemarkChars(inv.remark) > 200) {
    errors.push(`备注栏超出 200 字符限制（当前 ${countRemarkChars(inv.remark)} 字符）`);
  }

  // 货物运输服务特定业务校验
  if (inv.isFreight && inv.transport) {
    const t = inv.transport;
    const required = [
      ['起运地', 'qyd'], ['到达地', 'ddd'],
      ['运输工具种类', 'ysgjzl'], ['运输工具号牌', 'ysgjhp'], ['运输货物名称', 'yshwmc'],
    ];
    for (const [label, key] of required) {
      if (!t[key] || !String(t[key]).trim()) {
        errors.push(`货物运输特定业务缺少${label}`);
      }
    }
  }

  return errors;
}

// ===== Excel 生成核心 =====

/**
 * 构建数电票批量导入 Excel（4 个工作表）
 *
 * @param {Array}  invoices  — 发票数据数组（每项含 buyer/items/transport/remark 等）
 * @param {Object} seller    — 销方信息 { name, taxNo, address, phone, bankName, bankAccount }
 * @param {Object} options   — 全局选项 { invoiceType, hsbz, kpr, skr, fhr }
 * @returns {Buffer} Excel 文件 Buffer
 */
async function buildDigitalTaxExcel(invoices, seller, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '货代管理系统';
  wb.created = new Date();

  const {
    invoiceType = INVOICE_TYPE.DIGITAL_NORMAL,
    hsbz = HS_FLAG.EXCLUDE,
    kpr = '',
    skr = '',
    fhr = '',
  } = options;

  // === Sheet 1: 发票基本信息 ===
  const ws1 = wb.addWorksheet('发票基本信息');
  const sheet1Cols = [
    { header: '发票流水号',     key: 'dklsh',   width: 22 },
    { header: '发票类型',       key: 'fplxdm',  width: 10 },
    { header: '自然人标志',     key: 'zrrbs',   width: 10 },
    { header: '开票类型',       key: 'kplx',    width: 10 },
    { header: '征税方式',       key: 'zsfs',    width: 10 },
    { header: '是否含税',       key: 'hsbz',    width: 10 },
    { header: '购方名称',       key: 'ghdwmc',  width: 30 },
    { header: '购方纳税识别号', key: 'ghdwsbh', width: 22 },
    { header: '购方地址电话',   key: 'ghdwdzdh',width: 30 },
    { header: '购方开户行及账号',key: 'ghdwyhzh',width: 30 },
    { header: '收款人',         key: 'skr',     width: 12 },
    { header: '复核人',         key: 'fhr',     width: 12 },
    { header: '开票人',         key: 'kpr',     width: 12 },
    { header: '备注',           key: 'bz',      width: 30 },
    { header: '价税合计',       key: 'jshj',    width: 14 },
  ];
  ws1.columns = sheet1Cols;
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // === Sheet 2: 发票明细信息 ===
  const ws2 = wb.addWorksheet('发票明细信息');
  const sheet2Cols = [
    { header: '发票流水号',   key: 'dklsh', width: 22 },
    { header: '发票行性质',   key: 'fphxz', width: 10 },
    { header: '项目名称',     key: 'spmc',  width: 36 },
    { header: '税收分类编码', key: 'spbm',  width: 22 },
    { header: '规格型号',     key: 'ggxh',  width: 14 },
    { header: '单位',         key: 'dw',    width: 10 },
    { header: '数量',         key: 'spsl',  width: 10 },
    { header: '单价',         key: 'dj',    width: 16 },
    { header: '金额',         key: 'je',    width: 14 },
    { header: '税率',         key: 'sl',    width: 10 },
    { header: '税额',         key: 'se',    width: 14 },
    { header: '优惠政策',     key: 'yhzcbs',width: 10 },
    { header: '免税类型',     key: 'lslbs', width: 10 },
  ];
  ws2.columns = sheet2Cols;
  ws2.getRow(1).font = { bold: true };
  ws2.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // === Sheet 3: 特定业务信息 ===
  const ws3 = wb.addWorksheet('特定业务信息');
  const sheet3Cols = [
    { header: '发票流水号',   key: 'dklsh',    width: 22 },
    { header: '特定业务类型', key: 'tdyslxdm', width: 18 },
    { header: '起运地',       key: 'qyd',      width: 24 },
    { header: '到达地',       key: 'ddd',      width: 24 },
    { header: '运输工具种类', key: 'ysgjzl',   width: 14 },
    { header: '运输工具号牌', key: 'ysgjhp',   width: 16 },
    { header: '运输货物名称', key: 'yshwmc',   width: 20 },
  ];
  ws3.columns = sheet3Cols;
  ws3.getRow(1).font = { bold: true };
  ws3.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // === Sheet 4: 附加要素信息 ===
  const ws4 = wb.addWorksheet('附加要素信息');
  const sheet4Cols = [
    { header: '发票流水号',       key: 'dklsh',     width: 22 },
    { header: '附加要素名称',     key: 'fjysmc',    width: 20 },
    { header: '附加要素项目名称', key: 'fjysxmmc',  width: 20 },
    { header: '附加要素项目内容', key: 'fjysxmnr',  width: 30 },
  ];
  ws4.columns = sheet4Cols;
  ws4.getRow(1).font = { bold: true };
  ws4.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // === 填充数据 ===
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const dklsh = inv.dklsh || genDklsh(inv.id || 0, i + 1);
    const buyer = inv.buyer || {};

    // --- Sheet 1: 发票基本信息 ---
    const jshj = Number(inv.totalAmount || 0);
    ws1.addRow({
      dklsh,
      fplxdm: invoiceType,
      zrrbs: 'N',
      kplx: '0',
      zsfs: '0',
      hsbz,
      ghdwmc: buyer.name || '',
      ghdwsbh: buyer.taxNo || '',
      ghdwdzdh: [buyer.address, buyer.phone].filter(Boolean).join(' '),
      ghdwyhzh: [buyer.bankName, buyer.bankAccount].filter(Boolean).join(' '),
      skr: inv.skr || skr || '',
      fhr: inv.fhr || fhr || '',
      kpr: inv.kpr || kpr || '',
      bz: inv.remark || '',
      jshj: jshj.toFixed(2),
    });

    // --- Sheet 2: 发票明细信息 ---
    const items = inv.items || [];
    for (const item of items) {
      const je = Number(item.je ?? item.amount ?? 0);
      const slValue = Number(item.sl ?? inv.taxRate ?? 0) / 100;
      const se = Number((je * slValue).toFixed(2));
      const spsl = Number(item.spsl || 1);
      const dj = spsl ? Number((je / spsl).toFixed(8)) : 0;
      ws2.addRow({
        dklsh,
        fphxz: item.fphxz || '0',
        spmc: item.spmc || item.description || '',
        spbm: item.spbm || TAX_CODE_MAP.other.code,
        ggxh: item.ggxh || '',
        dw: item.dw || '次',
        spsl,
        dj,
        je: je.toFixed(2),
        sl: slValue.toFixed(3),
        se: se.toFixed(2),
        yhzcbs: '',
        lslbs: '',
      });
    }

    // --- Sheet 3: 特定业务信息（货物运输服务）---
    if (inv.isFreight && inv.transport) {
      const t = inv.transport;
      ws3.addRow({
        dklsh,
        tdyslxdm: '货物运输服务',
        qyd: t.qyd || '',
        ddd: t.ddd || '',
        ysgjzl: t.ysgjzl || '',
        ysgjhp: t.ysgjhp || '',
        yshwmc: t.yshwmc || '',
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  logger.info('[DIGITAL_TAX] Excel 生成完成', { invoices: invoices.length, invoiceType, hsbz });
  return buf;
}

module.exports = {
  buildDigitalTaxExcel,
  validateInvoice,
  countRemarkChars,
  genDklsh,
  getTaxInfo,
  TAX_CODE_MAP,
  TRANSPORT_MODE_MAP,
  INVOICE_TYPE,
  HS_FLAG,
};
