// 打印模板通用定义与工具
// 与后端 printService.js / data/printFields.js 的数据结构对齐：
// content = { blocks: [{type, ...}] }，字段 key 使用 `数据源.字段` 点路径（如 order.customer.name）
import { printTemplateAPI } from '@/api';

// 单据类型（与后端 PrintTemplate.docType ENUM 一致）
export const PRINT_DOC_TYPES = [
  { value: 'bl', label: '提单' },
  { value: 'invoice', label: '发票' },
  { value: 'packing_list', label: '装箱单' },
  { value: 'quotation', label: '报价单' },
  { value: 'customs', label: '报关单' },
  { value: 'statement', label: '对账单' },
  { value: 'order', label: '订单操作单' },
  { value: 'settlement', label: '结算单' },
];

export const docTypeLabel = (v) => PRINT_DOC_TYPES.find((d) => d.value === v)?.label || v;

export const BLOCK_LABELS = {
  header: '头部标题', logo: '公司 Logo', fields: '字段区',
  table: '数据表格', sign: '签署栏', footer: '页脚',
};

// 纸张规格（与后端 pageSize 一致）
export const PAGE_SIZES = ['A4', 'A5', 'Letter'];

// 表格数据源（table 区块 key 可选值，与 printService 表格注入逻辑一致）
export const TABLE_SOURCES = [
  { value: 'quotation.items', label: '报价费用明细（quotation.items）' },
  { value: 'finance', label: '财务/结算明细（finance）' },
];

// 设计期预览用的示例业务数据（键路径与字段库一致，字段按需解析）
const SAMPLE = {
  order: {
    orderNo: 'EXP-20250718-01', type: '出口', mode: '海运',
    customer: { name: '青岛海联贸易有限公司' },
    originPort: '青岛港', destPort: '鹿特丹港',
    cargoDesc: '工业机械设备一批', packageCount: 120, cargoWeight: 45.6, cargoVolume: 88.4,
    containerNo: 'MSKU1234567', etd: '2025-07-25', eta: '2025-08-20',
    totalAmount: 86000, currency: 'USD',
  },
  booking: {
    vesselName: 'COSCO SHIPPING ARIES', voyageNo: '072W', containerType: '40HQ',
    containerQty: 3, bookingNo: 'BK-2025-0718',
    supplier: { name: '中远海运集装箱运输有限公司' },
  },
  quotation: {
    quoteNo: 'QT-2025-0001', mode: '海运', serviceType: '整箱',
    customer: { name: '青岛海联贸易有限公司' },
    originPort: '青岛港', destPort: '鹿特丹港', cargoDesc: '工业机械设备一批',
    totalAmount: 86000, validUntil: '2025-08-30',
    items: [
      { name: '海运运费', category: 'ocean_freight', amount: '68000.00' },
      { name: '单证费', category: 'document_fee', amount: '500.00' },
    ],
  },
  customs: {
    declNo: 'DG-2025-0718-001', type: '出口报关', hsCode: '8428.90',
    customsValue: 86000, status: '已放行', submitDate: '2025-07-18',
  },
  finance: [
    { name: '海运运费', direction: '应收', amount: 68000, status: '已收' },
    { name: '单证费', direction: '应收', amount: 500, status: '未收' },
  ],
};

// 预览用全量示例数据（返回超集，模板只解析自己用到的字段）
export function sampleData() {
  return { order: SAMPLE.order, booking: SAMPLE.booking, quotation: SAMPLE.quotation, customs: SAMPLE.customs, finance: SAMPLE.finance };
}

// 解析 content 为 { blocks: [] }
export function parseContent(content) {
  if (!content) return { blocks: [] };
  try {
    const c = typeof content === 'string' ? JSON.parse(content) : content;
    return { blocks: Array.isArray(c.blocks) ? c.blocks : [] };
  } catch (e) {
    return { blocks: [] };
  }
}

// 新建模板默认区块（与后端 data/printFields.js defaultContent 对齐）
export function defaultBlocks(docType, fields) {
  return [
    { type: 'header', title: '货运单据', align: 'center', fontSize: 18, bold: true },
    {
      type: 'fields', label: '单据信息', columns: 2,
      fields: (fields || []).slice(0, 8).map((f) => ({ key: f.key, label: f.label, show: true, type: f.type })),
    },
    { type: 'footer', text: '本单由货代管理系统生成', align: 'center' },
  ];
}

// 拉取某单据类型的可用字段库
export function loadFields(docType) {
  return printTemplateAPI.fields(docType).catch(() => []);
}

// 空区块工厂
export function createBlock(type) {
  const map = {
    header: { type: 'header', title: '单据标题', align: 'center', fontSize: 18, bold: true },
    logo: { type: 'logo', url: '', width: 160 },
    fields: { type: 'fields', label: '字段区', columns: 2, fields: [] },
    table: { type: 'table', label: '数据表格', key: 'quotation.items', columns: [{ key: 'name', label: '费用名称' }] },
    sign: { type: 'sign', columns: ['承运人', '货主'] },
    footer: { type: 'footer', text: '页脚说明', align: 'center' },
  };
  return map[type] ? JSON.parse(JSON.stringify(map[type])) : { type };
}
