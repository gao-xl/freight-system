// Onboarding 示例数据服务（Spec v2.1 §5/§6 + 设计细化 §4）
// 职责：
//   - generateDemoData()：事务生成完整演示闭环（3 客户 / 2 供应商 / 3 报价(含明细) / 2 订单(海+空, 含提单三要素)
//     / 1 订舱 / 1 报关 / 4 财务流水 / 1 运价），全部 isDemo=true 并登记批次（DemoDataLogs）
//   - clearDemoData()：事务内按依赖逆序仅删 isDemo=true 记录，真实数据不受影响；批次标记 isCleared
//   - getOnboardingStatus()：各资源 count + companyConfigured（空态判定权威源，进度全部派生自真实数据）
// 安全护栏：仅业务表全空（排除 isDemo 后）允许生成；绝不复用 seed.js 的 force sync 清库。
// 所有记录 groupId/ownerId 留空，不归属任何小组，避免污染数据隔离统计。

const { Op } = require('sequelize');
const {
  sequelize, Customer, Supplier, Quotation, QuotationItem, Order, Booking,
  CustomsDeclaration, FinanceRecord, FreightRate, CompanyProfile, DemoDataLog,
} = require('../models');
const { logger } = require('../utils/logger');

const DEMO_PREFIX = '演示';

// 表空预检清单：任一表存在非演示数据即拒绝生成（AC-15，绝不 force sync）
const EMPTY_CHECK_TABLES = [
  Customer, Supplier, Quotation, Order, Booking, CustomsDeclaration, FinanceRecord, FreightRate,
];

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function makeBatchId() {
  const now = new Date();
  const pad = (v, len = 2) => String(v).padStart(len, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `demo-${stamp}-${rand}`;
}

// 预检：核心业务表（排除 isDemo 后）必须全部为空，否则 409
async function assertTablesEmpty() {
  for (const Model of EMPTY_CHECK_TABLES) {
    const count = await Model.count({ where: { isDemo: { [Op.ne]: true } } });
    if (count > 0) {
      const err = new Error('系统已有业务数据，为保护真实数据拒绝生成示例数据（可先清空示例数据或自行录入）');
      err.status = 409;
      throw err;
    }
  }
}

// 生成示例数据（幂等：先清存量 isDemo，再建新批次）
async function generateDemoData() {
  await assertTablesEmpty();
  await clearDemoData();

  const batchId = makeBatchId();
  const ts = Date.now();

  const result = await sequelize.transaction(async (t) => {
    await DemoDataLog.create({ batchId, isCleared: false }, { transaction: t });

    // ---- 客户 ×3（行业真实感：青岛海诚国际物流等） ----
    const customers = await Customer.bulkCreate([
      {
        code: `DEMO-C-${ts}01`, name: `${DEMO_PREFIX}客户：青岛海诚国际物流`, shortName: '海诚物流',
        type: 'exporter', level: 'A', contact: '孙海洋', phone: '0532-88886666', email: 'demo@haicheng.com',
        address: '青岛市市南区香港中路61号', creditLimit: 500000, businessScope: '大宗散货与集装箱出口',
        status: 'active', isDemo: true,
      },
      {
        code: `DEMO-C-${ts}02`, name: `${DEMO_PREFIX}客户：上海远洋供应链管理`, shortName: '远洋供应链',
        type: 'forwarder', level: 'B', contact: '林晓峰', phone: '021-58889999', email: 'demo@yuanyang.com',
        address: '上海市浦东新区民生路118号', creditLimit: 300000, businessScope: '综合货代与供应链服务',
        status: 'active', isDemo: true,
      },
      {
        code: `DEMO-C-${ts}03`, name: `${DEMO_PREFIX}客户：宁波天宇进出口贸易`, shortName: '天宇进出口',
        type: 'importer', level: 'B', contact: '陈嘉怡', phone: '0574-87775555', email: 'demo@tianyu.com',
        address: '宁波市鄞州区南部商务区', creditLimit: 800000, businessScope: '机电产品进出口',
        status: 'active', isDemo: true,
      },
    ], { transaction: t });

    // ---- 供应商 ×2（承运人 + 报关行，与订单/报关关联） ----
    const suppliers = await Supplier.bulkCreate([
      {
        code: `DEMO-S-${ts}01`, name: `${DEMO_PREFIX}承运：中远海运`, category: 'carrier',
        contact: '船司专线', phone: '95583', email: 'demo@cosco.com',
        ports: '青岛-欧洲 | 青岛-美洲 | 上海-新加坡', paymentTerms: '月结30天', status: 'active', isDemo: true,
      },
      {
        code: `DEMO-S-${ts}02`, name: `${DEMO_PREFIX}报关：大鹏报关行`, category: 'customs_broker',
        contact: '报关联络人', phone: '0755-88886666', email: 'demo@dapeng.com',
        ports: '青岛口岸 | 深圳口岸', paymentTerms: '单票结算', status: 'active', isDemo: true,
      },
    ], { transaction: t });

    // ---- 报价 ×3（含明细，与订单对应 + 1 条备用） ----
    const q1 = await Quotation.create({
      quoteNo: `DEMO-Q-${ts}01`, customerId: customers[0].id, type: 'export', mode: 'sea', serviceType: 'fcl',
      originPort: '青岛港', destPort: '洛杉矶', cargoDesc: '纺织服装', cargoWeight: 12500, cargoVolume: 58,
      packageCount: 420, currency: 'USD', totalAmount: 18500, costAmount: 14800, profitAmount: 3700,
      profitRate: 20, status: 'sent', validUntil: day(30), isDemo: true,
    }, { transaction: t });
    await QuotationItem.bulkCreate([
      { quotationId: q1.id, name: '海运费（应收）', category: 'ocean_freight', direction: 'revenue', unit: '票', quantity: 1, unitPrice: 18500, currency: 'USD', amount: 18500, isDemo: true },
      { quotationId: q1.id, name: '海运费成本（应付）', category: 'ocean_freight', direction: 'cost', unit: '票', quantity: 1, unitPrice: 14800, currency: 'USD', amount: 14800, supplierId: suppliers[0].id, isDemo: true },
      { quotationId: q1.id, name: '报关费（应收）', category: 'customs_fee', direction: 'revenue', unit: '票', quantity: 1, unitPrice: 300, currency: 'CNY', amount: 300, isDemo: true },
    ], { transaction: t });

    const q2 = await Quotation.create({
      quoteNo: `DEMO-Q-${ts}02`, customerId: customers[1].id, type: 'export', mode: 'sea', serviceType: 'lcl',
      originPort: '上海港', destPort: '新加坡港', cargoDesc: '电子配件拼箱', cargoWeight: 3200, cargoVolume: 20,
      packageCount: 150, currency: 'USD', totalAmount: 6800, costAmount: 5200, profitAmount: 1600,
      profitRate: 23.53, status: 'draft', validUntil: day(30), isDemo: true,
    }, { transaction: t });
    await QuotationItem.bulkCreate([
      { quotationId: q2.id, name: '拼箱操作费（应收）', category: 'local_charge', direction: 'revenue', unit: '票', quantity: 1, unitPrice: 6800, currency: 'USD', amount: 6800, isDemo: true },
    ], { transaction: t });

    const q3 = await Quotation.create({
      quoteNo: `DEMO-Q-${ts}03`, customerId: customers[2].id, type: 'export', mode: 'air', serviceType: 'express',
      originPort: '宁波栎社', destPort: '仁川国际', cargoDesc: '精密仪器', cargoWeight: 850, cargoVolume: 3,
      packageCount: 60, currency: 'USD', totalAmount: 9200, costAmount: 7600, profitAmount: 1600,
      profitRate: 17.39, status: 'sent', validUntil: day(30), isDemo: true,
    }, { transaction: t });
    await QuotationItem.bulkCreate([
      { quotationId: q3.id, name: '空运费（应收）', category: 'air_freight', direction: 'revenue', unit: '票', quantity: 1, unitPrice: 9200, currency: 'USD', amount: 9200, isDemo: true },
      { quotationId: q3.id, name: '空运费成本（应付）', category: 'air_freight', direction: 'cost', unit: '票', quantity: 1, unitPrice: 7600, currency: 'USD', amount: 7600, isDemo: true },
    ], { transaction: t });

    // ---- 订单 ×2（一海运一空运，含提单三要素 D2 字段） ----
    const o1 = await Order.create({
      orderNo: `DEMO-O-${ts}01`, customerId: customers[0].id, type: 'export', mode: 'sea', serviceType: 'fcl',
      status: 'in_progress', originPort: '青岛港', destPort: '洛杉矶', originPlace: '青岛', destPlace: '洛杉矶',
      cargoDesc: '纺织服装', cargoWeight: 12500, cargoVolume: 58, packageCount: 420,
      shipperName: '青岛海诚国际物流有限公司', shipperAddress: '青岛市市南区香港中路61号',
      consigneeName: 'HAI CHENG (USA) INC.', consigneeAddress: '1234 E Ocean Blvd, Long Beach, CA 90802',
      notifyParty: '同收货人', marksNumbers: 'N/M', placeOfReceipt: '青岛', placeOfDelivery: '洛杉矶',
      freightCharges: 'FREIGHT PREPAID', originalBLCount: 3, telexRelease: false,
      etd: day(2), eta: day(25), currency: 'USD', totalAmount: 18500, quotationId: q1.id, isDemo: true,
    }, { transaction: t });
    const o2 = await Order.create({
      orderNo: `DEMO-O-${ts}02`, customerId: customers[2].id, type: 'export', mode: 'air', serviceType: 'express',
      status: 'confirmed', originPort: '宁波栎社', destPort: '仁川国际', originPlace: '宁波', destPlace: '仁川',
      cargoDesc: '精密仪器', cargoWeight: 850, cargoVolume: 3, packageCount: 60,
      shipperName: '宁波天宇进出口贸易有限公司', shipperAddress: '宁波市鄞州区南部商务区',
      consigneeName: 'SKYUNI KOREA CO., LTD.', consigneeAddress: '25 Teheran-ro, Gangnam-gu, Seoul, Korea',
      notifyParty: '同收货人', marksNumbers: 'N/M', placeOfReceipt: '宁波', placeOfDelivery: '仁川',
      freightCharges: 'FREIGHT PREPAID', originalBLCount: 3, telexRelease: false,
      etd: day(3), eta: day(5), currency: 'USD', totalAmount: 9200, quotationId: q3.id, isDemo: true,
    }, { transaction: t });

    // ---- 订舱 ×1（挂 O1） ----
    await Booking.create({
      bookingNo: `DEMO-B-${ts}01`, orderId: o1.id, supplierId: suppliers[0].id,
      vesselName: 'COSCO SHANGHAI', voyageNo: 'V001E', containerType: '40HQ', containerQty: 1, teu: 2,
      status: 'confirmed', bookingDate: day(-2), etd: day(2), eta: day(25), freightCharge: 14800, isDemo: true,
    }, { transaction: t });

    // ---- 报关 ×1（挂 O1） ----
    await CustomsDeclaration.create({
      declNo: `DEMO-D-${ts}01`, orderId: o1.id, supplierId: suppliers[1].id,
      type: 'export_clearance', status: 'submitted', hsCode: '6204.4200', customsValue: 18500,
      submitDate: day(-1), isDemo: true,
    }, { transaction: t });

    // ---- 财务流水 ×4（应收应付齐全，挂 O1/O2） ----
    await FinanceRecord.bulkCreate([
      { orderId: o1.id, direction: 'receivable', category: 'ocean_freight', description: '海运运费（应收）', amount: 18500, currency: 'USD', status: 'unpaid', counterpartyId: customers[0].id, isDemo: true },
      { orderId: o1.id, direction: 'payable', category: 'ocean_freight', description: '船公司运费（应付）', amount: 14800, currency: 'USD', status: 'unpaid', counterpartyId: suppliers[0].id, isDemo: true },
      { orderId: o1.id, direction: 'receivable', category: 'document_fee', description: '单证费（应收）', amount: 300, currency: 'CNY', status: 'paid', paidAmount: 300, paidAt: new Date(), counterpartyId: customers[0].id, isDemo: true },
      { orderId: o2.id, direction: 'receivable', category: 'air_freight', description: '空运费（应收）', amount: 9200, currency: 'USD', status: 'unpaid', counterpartyId: customers[2].id, isDemo: true },
    ], { transaction: t });

    // ---- 运价表 ×1（FreightRate） ----
    const validTo = new Date();
    validTo.setDate(validTo.getDate() + 90);
    await FreightRate.create({
      route: '青岛-洛杉矶', originPort: '青岛港', destPort: '洛杉矶', carrier: '中远海运',
      containerType: '40HQ', rate: 1850, currency: 'USD', validFrom: new Date(), validTo, remark: '演示运价', isDemo: true,
    }, { transaction: t });

    const counts = {
      customers: customers.length,
      suppliers: suppliers.length,
      quotations: 3,
      orders: 2,
      bookings: 1,
      declarations: 1,
      financeRecords: 4,
      freightRates: 1,
    };
    return { batchId, counts };
  });

  logger.info(`[DEMO] 已生成示例数据：批次 ${batchId} ${JSON.stringify(result.counts)}`);
  return result;
}

// 一键清空示例数据（事务内按依赖逆序：财务 → 报关 → 订舱 → 报价明细 → 报价 → 订单 → 运价 → 供应商 → 客户）
// 仅删 isDemo=true 记录；force:true 物理删除（演示数据无子表引用，避免软删残留污染"表空"判定）
async function clearDemoData() {
  let deleted = 0;
  await sequelize.transaction(async (t) => {
    const demoOrderIds = (await Order.findAll({ where: { isDemo: true }, attributes: ['id'], transaction: t })).map((r) => r.id);
    const demoQuoteIds = (await Quotation.findAll({ where: { isDemo: true }, attributes: ['id'], transaction: t })).map((r) => r.id);

    deleted += await FinanceRecord.destroy({ where: { isDemo: true }, force: true, transaction: t });
    deleted += await CustomsDeclaration.destroy({ where: { isDemo: true }, force: true, transaction: t });
    deleted += await Booking.destroy({ where: { isDemo: true }, force: true, transaction: t });
    if (demoQuoteIds.length) deleted += await QuotationItem.destroy({ where: { quotationId: demoQuoteIds }, force: true, transaction: t });
    deleted += await Quotation.destroy({ where: { isDemo: true }, force: true, transaction: t });
    if (demoOrderIds.length) deleted += await Order.destroy({ where: { id: demoOrderIds }, force: true, transaction: t });
    deleted += await FreightRate.destroy({ where: { isDemo: true }, transaction: t });
    deleted += await Supplier.destroy({ where: { isDemo: true }, force: true, transaction: t });
    deleted += await Customer.destroy({ where: { isDemo: true }, force: true, transaction: t });

    // 批次标记已清（保留审计，不物理删除批次记录）
    await DemoDataLog.update({ isCleared: true }, { where: { isCleared: false }, transaction: t });
  });
  logger.info(`[DEMO] 示例数据已清空，删除 ${deleted} 条`);
  return deleted;
}

// 空态判定权威源：各资源 count + 公司是否已配置（进度全部派生自真实数据，不建状态表）
async function getOnboardingStatus() {
  const [
    customers, quotations, orders, bookings, declarations, financeRecords, freightRates, companyProfile,
  ] = await Promise.all([
    Customer.count(),
    Quotation.count(),
    Order.count(),
    Booking.count(),
    CustomsDeclaration.count(),
    FinanceRecord.count(),
    FreightRate.count(),
    CompanyProfile.findOne({ attributes: ['companyName'] }),
  ]);
  return {
    customers,
    quotations,
    orders,
    bookings,
    declarations,
    financeRecords,
    freightRates,
    companyConfigured: !!(companyProfile && companyProfile.companyName && String(companyProfile.companyName).trim()),
  };
}

module.exports = { generateDemoData, clearDemoData, getOnboardingStatus };
