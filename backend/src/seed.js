// 演示数据初始化脚本: node src/seed.js
const bcrypt = require('bcryptjs');
const {
  sequelize, User, Customer, Supplier, Order, Booking,
  CustomsDeclaration, Document, ShipmentTrack, FinanceRecord, IntegrationConfig,
  Quotation, QuotationItem, Role, Permission, UserRole, RolePermission,
  QingdaoNode, YardMeta,
} = require('./models');

async function seed() {
  await sequelize.sync({ force: true });
  console.log('数据库已重建');

  // 用户
  const pwd = await bcrypt.hash('123456', 10);
  const users = [
    { username: 'admin', name: '系统管理员', role: 'admin', password: pwd },
    { username: 'manager', name: '张经理', role: 'manager', password: pwd },
    { username: 'operator', name: '李操作', role: 'operator', password: pwd },
    { username: 'finance', name: '王财务', role: 'finance', password: pwd },
  ];
  await User.bulkCreate(users);

  // 客户
  const customers = [
    { code: 'CUS20260801001', name: '上海华茂国际贸易有限公司', shortName: '华茂国际', type: 'exporter', level: 'A', contact: '陈磊', phone: '13800000001', email: 'chenlei@huamao.com', address: '上海市浦东新区世纪大道100号', creditLimit: 500000, businessScope: '纺织服装出口', taxNo: '91310000MA1XXXXX01' },
    { code: 'CUS20260801002', name: '深圳前海顺达物流有限公司', shortName: '顺达物流', type: 'forwarder', level: 'B', contact: '刘芳', phone: '13800000002', email: 'liufang@shunda.com', address: '深圳市南山区前海深港合作区', creditLimit: 300000, businessScope: '综合物流代理', taxNo: '91440300MA2XXXXX02' },
    { code: 'CUS20260801003', name: '广州恒丰电子科技有限公司', shortName: '恒丰电子', type: 'importer', level: 'A', contact: '周强', phone: '13800000003', email: 'zhouqiang@hengfeng.com', address: '广州市黄埔区科学城', creditLimit: 800000, businessScope: '电子元器件进口', taxNo: '91440100MA1XXXXX03' },
    { code: 'CUS20260801004', name: '宁波海纳进出口有限公司', shortName: '海纳进出口', type: 'exporter', level: 'C', contact: '吴敏', phone: '13800000004', email: 'wumin@haina.com', address: '宁波市鄞州区南部商务区', creditLimit: 200000, businessScope: '五金工具出口', taxNo: '91330200MA1XXXXX04' },
    { code: 'CUS20260801005', name: '青岛蓝海供应链股份公司', shortName: '蓝海供应链', type: 'shipper', level: 'B', contact: '郑涛', phone: '13800000005', email: 'zhengtao@blueocean.com', address: '青岛市市南区香港中路', creditLimit: 400000, businessScope: '大宗散货运输', taxNo: '91370200MA1XXXXX05' },
  ];
  await Customer.bulkCreate(customers);

  // 供应商
  const suppliers = [
    { code: 'SUP20260801001', name: '中远海运集装箱运输有限公司', category: 'carrier', contact: '接口专线', phone: '95583', email: 'service@cosco.com', ports: '上海-欧洲 | 上海-美洲', contractNo: 'SA-2026-001', paymentTerms: '月结30天' },
    { code: 'SUP20260801002', name: '马士基航运（中国）有限公司', category: 'carrier', contact: '华东大客户部', phone: '95580', email: 'cn.service@maersk.com', ports: '宁波-东南亚 | 深圳-中东', contractNo: 'MA-2026-002', paymentTerms: '月结45天' },
    { code: 'SUP20260801003', name: '中国南方航空货运部', category: 'airline', contact: '货运销售部', phone: '95539', email: 'cargo@csair.com', ports: '广州-北美 | 广州-欧洲', contractNo: 'CZ-2026-003', paymentTerms: '月结30天' },
    { code: 'SUP20260801004', name: '深圳大鹏报关行', category: 'customs_broker', contact: '报关联络人', phone: '0755-88886666', email: 'service@dapeng.com', ports: '深圳口岸', contractNo: 'CB-2026-004', paymentTerms: '单票结算' },
    { code: 'SUP20260801005', name: '上海东方国际物流车队', category: 'truck', contact: '调度中心', phone: '021-55556666', email: 'dispatch@east.com', ports: '长三角区域', contractNo: 'TK-2026-005', paymentTerms: '月结30天' },
  ];
  await Supplier.bulkCreate(suppliers);

  // 订单
  const orders = [
    { orderNo: 'SO20260801001', customerId: 1, type: 'export', mode: 'sea', serviceType: 'fcl', status: 'in_progress', originPort: '上海港', destPort: '鹿特丹', originPlace: '南通', destPlace: '鹿特丹港', cargoDesc: '纺织服装', cargoWeight: 12500, cargoVolume: 58, packageCount: 420, containerNo: 'COSU1234567', etd: '2026-08-10', eta: '2026-09-02', currency: 'USD', totalAmount: 18500, remark: '直达欧洲基本港' },
    { orderNo: 'SO20260801002', customerId: 2, type: 'export', mode: 'sea', serviceType: 'lcl', status: 'confirmed', originPort: '上海港', destPort: '新加坡港', originPlace: '苏州', destPlace: '新加坡', cargoDesc: '电子配件拼箱', cargoWeight: 3200, cargoVolume: 20, packageCount: 150, etd: '2026-08-15', eta: '2026-08-25', currency: 'USD', totalAmount: 6800, remark: '拼箱货' },
    { orderNo: 'SO20260801003', customerId: 3, type: 'import', mode: 'air', serviceType: 'express', status: 'in_progress', originPort: '首尔仁川机场', destPort: '广州白云机场', originPlace: '首尔', destPlace: '广州', cargoDesc: '电子元器件', cargoWeight: 850, cargoVolume: 3, packageCount: 60, flightNo: 'CZ338', etd: '2026-08-08', eta: '2026-08-09', currency: 'USD', totalAmount: 4200, remark: '空运快件' },
    { orderNo: 'SO20260801004', customerId: 4, type: 'export', mode: 'sea', serviceType: 'fcl', status: 'draft', originPort: '宁波舟山港', destPort: '汉堡港', originPlace: '义乌', destPlace: '汉堡', cargoDesc: '五金工具', cargoWeight: 9800, cargoVolume: 42, packageCount: 300, etd: '2026-08-20', eta: '2026-09-15', currency: 'USD', totalAmount: 13200, remark: '' },
    { orderNo: 'SO20260801005', customerId: 5, type: 'export', mode: 'sea', serviceType: 'fcl', status: 'completed', originPort: '青岛港', destPort: '鹿特丹', originPlace: '济南', destPlace: '鹿特丹', cargoDesc: '大宗散货', cargoWeight: 22000, cargoVolume: 90, packageCount: 800, containerNo: 'MSKU8765432', etd: '2026-07-20', eta: '2026-08-12', currency: 'USD', totalAmount: 26800, remark: '已结案' },
  ];
  await Order.bulkCreate(orders);

  // 订舱
  const bookings = [
    { bookingNo: 'BK20260801001', orderId: 1, supplierId: 1, vesselName: 'COSCO SHIPPING ARIES', voyageNo: '082W', containerType: '40HQ', containerQty: 2, teu: 4, status: 'confirmed', bookingDate: '2026-08-05', etd: '2026-08-10', eta: '2026-09-02', freightCharge: 14800 },
    { bookingNo: 'BK20260801002', orderId: 2, supplierId: 2, vesselName: 'MAERSK HAMBURG', voyageNo: '521E', containerType: 'LCL', containerQty: 1, teu: 1, status: 'new', bookingDate: '2026-08-07', etd: '2026-08-15', eta: '2026-08-25', freightCharge: 5200 },
    { bookingNo: 'BK20260801003', orderId: 3, supplierId: 3, flightNo: 'CZ338', containerType: 'AIR', containerQty: 0, teu: 0, status: 'shipped', bookingDate: '2026-08-06', etd: '2026-08-08', eta: '2026-08-09', freightCharge: 3600 },
    { bookingNo: 'BK20260801004', orderId: 5, supplierId: 1, vesselName: 'COSCO SHIPPING VIRGO', voyageNo: '056W', containerType: '40GP', containerQty: 3, teu: 6, status: 'shipped', bookingDate: '2026-07-18', etd: '2026-07-20', eta: '2026-08-12', freightCharge: 21000 },
  ];
  await Booking.bulkCreate(bookings);

  // 报关
  const customs = [
    { declNo: 'DC20260801001', orderId: 1, supplierId: 4, type: 'export_clearance', status: 'submitted', hsCode: '6204.4300', customsValue: 18500, taxAmount: 0, submitDate: '2026-08-06' },
    { declNo: 'DC20260801002', orderId: 2, supplierId: 4, type: 'export_clearance', status: 'prepared', hsCode: '8542.3100', customsValue: 6800, taxAmount: 0 },
    { declNo: 'DC20260801003', orderId: 3, supplierId: 4, type: 'import_clearance', status: 'inspecting', hsCode: '8541.1000', customsValue: 4200, taxAmount: 546, submitDate: '2026-08-07' },
    { declNo: 'DC20260801004', orderId: 5, supplierId: 4, type: 'export_clearance', status: 'released', hsCode: '7307.9900', customsValue: 26800, taxAmount: 0, submitDate: '2026-07-19', releaseDate: '2026-07-20' },
  ];
  await CustomsDeclaration.bulkCreate(customs);

  // 单证
  const docs = [
    { docType: 'bl', docNo: 'COSU2008W001', orderId: 1, title: '海运提单 - 华茂纺织', status: 'issued', issuedBy: '中远海运', issueDate: '2026-08-08' },
    { docType: 'packing_list', docNo: 'PL-001-01', orderId: 1, title: '装箱单 - 华茂纺织', status: 'sent' },
    { docType: 'invoice', docNo: 'INV-001-01', orderId: 1, title: '商业发票 - 华茂纺织', status: 'sent' },
    { docType: 'certificate_of_origin', docNo: 'CO-2026-0088', orderId: 1, title: '原产地证书', status: 'draft' },
    { docType: 'invoice', docNo: 'INV-003-01', orderId: 3, title: '商业发票 - 恒丰电子', status: 'issued', issuedBy: '恒丰电子', issueDate: '2026-08-07' },
  ];
  await Document.bulkCreate(docs);

  // 报价单（头 + 明细）
  const quotations = [
    { quoteNo: 'QT20260801001', customerId: 1, type: 'export', mode: 'sea', serviceType: 'fcl', originPort: '上海港', destPort: '鹿特丹', cargoDesc: '纺织服装', cargoWeight: 12500, cargoVolume: 58, packageCount: 420, currency: 'USD', totalAmount: 15100, costAmount: 11600, profitAmount: 3500, profitRate: 23.18, status: 'confirmed', validUntil: '2026-09-30', salesId: 3, remark: '欧洲基本港直达' },
    { quoteNo: 'QT20260801002', customerId: 2, type: 'export', mode: 'sea', serviceType: 'lcl', originPort: '上海港', destPort: '新加坡港', cargoDesc: '电子配件拼箱', cargoWeight: 3200, cargoVolume: 20, packageCount: 150, currency: 'USD', totalAmount: 6800, costAmount: 5200, profitAmount: 1600, profitRate: 23.53, status: 'sent', validUntil: '2026-08-31', salesId: 3, remark: '拼箱' },
    { quoteNo: 'QT20260801003', customerId: 4, type: 'export', mode: 'sea', serviceType: 'fcl', originPort: '宁波舟山港', destPort: '汉堡港', cargoDesc: '五金工具', cargoWeight: 9800, cargoVolume: 42, packageCount: 300, currency: 'USD', totalAmount: 13200, costAmount: 10800, profitAmount: 2400, profitRate: 18.18, status: 'draft', validUntil: '2026-09-15', salesId: 3, remark: '' },
  ];
  await Quotation.bulkCreate(quotations);

  const quotationItems = [
    { quotationId: 1, name: '海运运费', category: 'ocean_freight', direction: 'revenue', unit: '箱', quantity: 2, unitPrice: 7400, amount: 14800, costPrice: 5800, supplierId: 1 },
    { quotationId: 1, name: '报关费', category: 'customs_fee', direction: 'revenue', quantity: 1, unitPrice: 300, amount: 300, costPrice: 0, supplierId: 4 },
    { quotationId: 1, name: '船公司运费（成本）', category: 'ocean_freight', direction: 'cost', quantity: 2, unitPrice: 5800, amount: 11600, costPrice: 5800, supplierId: 1 },
    { quotationId: 2, name: '拼箱操作费', category: 'local_charge', direction: 'revenue', quantity: 1, unitPrice: 6800, amount: 6800, costPrice: 5200, supplierId: 2 },
    { quotationId: 2, name: '拼箱成本', category: 'other', direction: 'cost', quantity: 1, unitPrice: 5200, amount: 5200, costPrice: 5200, supplierId: 2 },
    { quotationId: 3, name: '海运运费', category: 'ocean_freight', direction: 'revenue', quantity: 1, unitPrice: 13200, amount: 13200, costPrice: 10800, supplierId: 1 },
    { quotationId: 3, name: '运费成本', category: 'ocean_freight', direction: 'cost', quantity: 1, unitPrice: 10800, amount: 10800, costPrice: 10800, supplierId: 1 },
  ];
  await QuotationItem.bulkCreate(quotationItems);

  // 运输跟踪
  const tracks = [
    { orderId: 1, bookingId: 1, stage: 'booked', location: '上海港', description: '已完成订舱确认', operator: '李操作', eventTime: new Date('2026-08-05 09:00') },
    { orderId: 1, bookingId: 1, stage: 'picked_up', location: '南通', description: '货物提货装车', operator: '李操作', eventTime: new Date('2026-08-07 14:30') },
    { orderId: 3, bookingId: 3, stage: 'in_transit', location: '广州白云机场', description: '航班起飞，预计次日到达', operator: '李操作', eventTime: new Date('2026-08-08 08:00') },
    { orderId: 5, bookingId: 4, stage: 'arrived', location: '鹿特丹港', description: '船舶已到港', operator: '张经理', eventTime: new Date('2026-08-12 06:00') },
  ];
  await ShipmentTrack.bulkCreate(tracks);

  // 青岛港专项：订单5（青岛出口）补充码头/开港/截港
  await Order.update(
    { terminal: 'QQCT', openTime: new Date('2026-07-18 08:00'), cutoffTime: new Date('2026-07-19 18:00') },
    { where: { id: 5 } }
  );
  const qdNodes = [
    { orderId: 5, bookingId: 4, node: 'picked_up', status: 'done', eventTime: new Date('2026-07-18 10:00'), detail: '已在场站提空箱', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'loaded', status: 'done', eventTime: new Date('2026-07-18 15:30'), detail: '装箱完成回场', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'arrived_port', status: 'done', eventTime: new Date('2026-07-19 09:00'), detail: '重箱进港', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'manifest_report', status: 'done', eventTime: new Date('2026-07-19 10:30'), detail: '运抵报告已生成', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'customs_release', status: 'done', eventTime: new Date('2026-07-19 16:00'), detail: '海关放行', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'loading_manifest', status: 'done', eventTime: new Date('2026-07-19 17:00'), detail: '装载舱单已发送', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'loaded_on_board', status: 'done', eventTime: new Date('2026-07-20 08:00'), detail: '已装船', source: 'manual', operator: '李操作' },
    { orderId: 5, bookingId: 4, node: 'departed', status: 'done', eventTime: new Date('2026-07-20 12:00'), detail: '船舶离港', source: 'manual', operator: '李操作' },
    // 订单1（进行中，上海出口）演示部分完成节点
    { orderId: 1, bookingId: 1, node: 'picked_up', status: 'done', eventTime: new Date('2026-08-07 14:30'), detail: '已提货', source: 'manual', operator: '李操作' },
    { orderId: 1, bookingId: 1, node: 'loaded', status: 'done', eventTime: new Date('2026-08-08 09:00'), detail: '装箱完成', source: 'manual', operator: '李操作' },
    { orderId: 1, bookingId: 1, node: 'arrived_port', status: 'done', eventTime: new Date('2026-08-08 15:00'), detail: '进港', source: 'manual', operator: '李操作' },
    { orderId: 1, bookingId: 1, node: 'manifest_report', status: 'warning', eventTime: new Date('2026-08-08 16:00'), detail: '运抵报告待生成', source: 'manual', operator: '李操作' },
    { orderId: 1, bookingId: 1, node: 'customs_release', status: 'pending', detail: '报关放行待确认', source: 'manual' },
  ];
  await QingdaoNode.bulkCreate(qdNodes);

  // 预警演示数据
  const now = new Date();
  const day = (n) => new Date(now.getTime() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const AlertRecord = require('./models/AlertRecord');
  const alerts = [
    { type: 'eta_soon', level: 'warning', orderId: 1, title: 'ETA 临近', message: '订单 SO20260801001 预计 3 天后到港，请关注清关与送达安排', dueAt: day(3), status: 'active', dedupKey: 'eta_soon:1:seed' },
    { type: 'cutoff_time', level: 'danger', orderId: 5, title: '截港时间临近', message: '订单 SO20260801005 距截港仅 12 小时，请确认重箱已进港', dueAt: day(0), status: 'active', dedupKey: 'cutoff_time:5:seed' },
    { type: 'overdue_receivable', level: 'danger', orderId: 1, title: '超期应收', message: '订单 SO20260801001 应收 USD 14800 已逾期 12 天', dueAt: day(-12), status: 'active', dedupKey: 'overdue_receivable:1:seed' },
    { type: 'customs_deadline', level: 'warning', orderId: 1, title: '报关临近截港', message: '订单 SO20260801001 报关未放行，请尽快处理', dueAt: day(1), status: 'active', dedupKey: 'customs_deadline:1:seed' },
    { type: 'blocked', level: 'danger', orderId: 1, title: '青岛港出口卡点', message: '订单 SO20260801001 节点异常（运抵报告）：请检查', dueAt: now, status: 'active', dedupKey: 'qingdao_blocked:seed' },
  ];
  await AlertRecord.bulkCreate(alerts);

  // 财务
  const finance = [
    { orderId: 1, direction: 'receivable', category: 'ocean_freight', description: '海运运费（应收）', amount: 14800, currency: 'USD', status: 'unpaid', counterpartyId: 1 },
    { orderId: 1, direction: 'payable', category: 'ocean_freight', description: '船公司运费（应付）', amount: 11800, currency: 'USD', status: 'unpaid', counterpartyId: 1 },
    { orderId: 2, direction: 'receivable', category: 'local_charge', description: '拼箱操作费（应收）', amount: 6800, currency: 'USD', status: 'partial', paidAmount: 3400, counterpartyId: 2 },
    { orderId: 3, direction: 'receivable', category: 'air_freight', description: '空运运费（应收）', amount: 4200, currency: 'USD', status: 'paid', paidAmount: 4200, paidAt: new Date('2026-08-08'), counterpartyId: 3 },
    { orderId: 3, direction: 'payable', category: 'customs_fee', description: '进口关税垫付（应付）', amount: 546, currency: 'CNY', status: 'paid', paidAmount: 546, paidAt: new Date('2026-08-08') },
    { orderId: 5, direction: 'receivable', category: 'ocean_freight', description: '海运运费（应收）', amount: 26800, currency: 'USD', status: 'paid', paidAmount: 26800, paidAt: new Date('2026-08-13'), counterpartyId: 5 },
    { orderId: 5, direction: 'payable', category: 'ocean_freight', description: '船公司运费（应付）', amount: 21000, currency: 'USD', status: 'paid', paidAmount: 21000, paidAt: new Date('2026-08-13') },
  ];
  await FinanceRecord.bulkCreate(finance);

  // 外部对接配置
  const integrations = [
    { code: 'port', name: '港口系统', baseUrl: process.env.PORT_SVC_URL || 'http://localhost:4001', apiKey: 'demo-port-key', authType: 'api_key', enabled: false, remark: '端口到港/离港、集装箱状态同步' },
    { code: 'customs', name: '海关系统', baseUrl: process.env.CUSTOMS_SVC_URL || 'http://localhost:4002', apiKey: 'demo-customs-key', authType: 'api_key', enabled: false, remark: '报关单申报与放行状态查询' },
    { code: 'finance', name: '财务系统', baseUrl: process.env.FINANCE_SVC_URL || 'http://localhost:4003', apiKey: 'demo-finance-key', authType: 'api_key', enabled: false, remark: '应收应付凭证、开票与对账同步' },
    { code: 'yard_qingdao', name: '青岛港场站', baseUrl: process.env.YARD_SVC_URL || 'http://localhost:4004', apiKey: 'demo-yard-key', authType: 'api_key', enabled: false, config: '{"enterpriseCode":"QD-DEMO","secret":"demo-yard-secret"}', remark: '长荣/捷丰/大亚/QQCT 等场站状态' },
    { code: 'ais_tracking', name: 'AIS 船舶追踪', baseUrl: 'https://data.aishub.net/ws/1.1/getdata.php', apiKey: '', authType: 'api_key', enabled: false, remark: '实时船位（免费额度）' },
    { code: 'ship_schedule', name: '船期查询', apiKey: '', authType: 'api_key', enabled: false, remark: '订舱/报价参考船期' },
    { code: 'exchange_rate', name: '汇率查询', apiKey: '', authType: 'api_key', enabled: false, remark: '多币种换算（open.er-api.com）' },
    { code: 'freight_rate', name: '运价查询', apiKey: '', authType: 'api_key', enabled: false, remark: '报价参考（预留）' },
  ];
  await IntegrationConfig.bulkCreate(integrations);

  // 场站名录（青岛港主流场站）
  const yardMetas = [
    { code: 'evergreen', name: '长荣场站', mode: 'api', enabled: false, remark: '船司场站，提单号查询' },
    { code: 'smart', name: '捷丰场站', mode: 'api', enabled: false, remark: '第三方，提单号查询' },
    { code: 'daya', name: '大亚场站', mode: 'scraper', enabled: false, remark: '第三方，需授权抓取' },
    { code: 'qqct', name: 'QQCT场站', mode: 'api', enabled: false, remark: '港口系，提单号/箱号查询' },
    { code: 'qqctu', name: 'QQCTU场站', mode: 'api', enabled: false, remark: '港口系，提单号查询' },
    { code: 'qinggang', name: '青港场站', mode: 'manual', enabled: true, remark: '港口系，人工维护' },
    { code: 'donggang', name: '东港场站', mode: 'manual', enabled: true, remark: '港口系，人工维护' },
    { code: 'hanjin', name: '韩进场站', mode: 'manual', enabled: true, remark: '船司场站，人工维护' },
    { code: 'shengshi', name: '胜狮场站', mode: 'manual', enabled: true, remark: '船司场站，人工维护' },
    { code: 'zhongchuang', name: '中创场站', mode: 'manual', enabled: true, remark: '第三方，人工维护' },
    { code: 'minjun', name: '珉钧场站', mode: 'manual', enabled: true, remark: '第三方，人工维护' },
  ];
  await YardMeta.bulkCreate(yardMetas);

  // RBAC：权限点定义
  const PERMS = [];
  const addPerms = (module, actions, nameFn) => {
    for (const a of actions) PERMS.push({ module, action: a, name: nameFn(a), code: `${module}:${a}` });
  };
  addPerms('auth', ['read'], () => '登录/认证');
  addPerms('dashboard', ['read'], () => '查看看板');
  addPerms('customer', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}客户`);
  addPerms('supplier', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}供应商`);
  addPerms('order', ['create', 'read', 'update', 'delete', 'approve'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批' })[a]}订单`);
  addPerms('booking', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}订舱`);
  addPerms('customs', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}报关`);
  addPerms('document', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}单证`);
  addPerms('track', ['create', 'read', 'update', 'delete'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除' })[a]}跟踪`);
  addPerms('finance', ['create', 'read', 'update', 'delete', 'approve'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批' })[a]}财务`);
  addPerms('quotation', ['create', 'read', 'update', 'delete', 'approve', 'convert'], (a) => `${({ create: '新建', read: '查看', update: '编辑', delete: '删除', approve: '审批', convert: '转订单' })[a]}报价`);
  addPerms('integration', ['read', 'update', 'trigger'], (a) => `${({ read: '查看', update: '配置', trigger: '触发' })[a]}对接`);
  addPerms('qingdao', ['read', 'update'], (a) => `${({ read: '查看', update: '更新' })[a]}青岛港节点`);
  addPerms('alert', ['read', 'update'], (a) => `${({ read: '查看', update: '处理' })[a]}预警`);
  addPerms('yard', ['read', 'update'], (a) => `${({ read: '查看', update: '查询/维护' })[a]}场站信息`);
  addPerms('print', ['read', 'write'], (a) => `${({ read: '查看/打印', write: '设计模板' })[a]}`);
  addPerms('release', ['read', 'create', 'approve'], (a) => `${({ read: '查看', create: '申请', approve: '审批' })[a]}放单`);
  addPerms('system', ['user', 'role', 'permission', 'audit', 'group', 'custom', 'company'], (a) => `${({ user: '用户', role: '角色', permission: '权限', audit: '审计', group: '小组', custom: '自定义字段', company: '公司设置' })[a]}管理`);
  const permissionRecords = await Permission.bulkCreate(PERMS);

  // RBAC：内置角色（含 B2 数据权限范围）
  const roleRecords = await Role.bulkCreate([
    { code: 'admin', name: '管理员', description: '系统管理 + 全部业务权限', isSystem: true, dataScope: 'all' },
    { code: 'manager', name: '经理', description: '全部业务 + 审批 + 转订单', isSystem: true, dataScope: 'all' },
    { code: 'operator', name: '操作员', description: '业务读写（无删除/审批/转订单）', isSystem: true, dataScope: 'group' },
    { code: 'finance', name: '财务', description: '财务读写 + 业务只读', isSystem: true, dataScope: 'all' },
    { code: 'viewer', name: '只读', description: '全部只读', isSystem: true, dataScope: 'group' },
  ]);

  // RBAC：角色-权限映射
  const actionGroup = (module, actions) => PERMS.filter((p) => p.module === module && actions.includes(p.action)).map((p) => p.code);
  const allBusiness = ['customer', 'supplier', 'order', 'booking', 'customs', 'document', 'track'];
  const rw = ['create', 'read', 'update'];
  const crud = ['create', 'read', 'update', 'delete'];
  const rolePermMap = {
    admin: PERMS.map((p) => p.code),
    manager: [
      ...allBusiness.flatMap((m) => actionGroup(m, crud)),
      ...actionGroup('order', ['approve']),
      ...actionGroup('finance', crud).concat(actionGroup('finance', ['approve'])),
      ...actionGroup('quotation', crud).concat(actionGroup('quotation', ['approve', 'convert'])),
      ...actionGroup('integration', ['read', 'update', 'trigger']),
      ...actionGroup('qingdao', ['read', 'update']),
      ...actionGroup('alert', ['read', 'update']),
      ...actionGroup('yard', ['read', 'update']),
      ...actionGroup('print', ['read', 'write']),
      ...actionGroup('release', ['read', 'create', 'approve']),
      ...actionGroup('dashboard', ['read']),
    ],
    operator: [
      ...allBusiness.flatMap((m) => actionGroup(m, rw)),
      ...actionGroup('finance', ['read']),
      ...actionGroup('quotation', rw),
      ...actionGroup('qingdao', ['read', 'update']),
      ...actionGroup('alert', ['read', 'update']),
      ...actionGroup('yard', ['read', 'update']),
      ...actionGroup('print', ['read']),
      ...actionGroup('dashboard', ['read']),
    ],
    finance: [
      ...allBusiness.flatMap((m) => actionGroup(m, ['read'])),
      ...actionGroup('finance', crud).concat(actionGroup('finance', ['approve'])),
      ...actionGroup('quotation', ['read']),
      ...actionGroup('qingdao', ['read']),
      ...actionGroup('alert', ['read']),
      ...actionGroup('yard', ['read']),
      ...actionGroup('print', ['read']),
      ...actionGroup('release', ['read']),
      ...actionGroup('dashboard', ['read']),
    ],
    viewer: [
      ...allBusiness.flatMap((m) => actionGroup(m, ['read'])),
      ...actionGroup('finance', ['read']),
      ...actionGroup('quotation', ['read']),
      ...actionGroup('qingdao', ['read']),
      ...actionGroup('alert', ['read']),
      ...actionGroup('yard', ['read']),
      ...actionGroup('print', ['read']),
      ...actionGroup('dashboard', ['read']),
    ],
  };
  const permByCode = Object.fromEntries(permissionRecords.map((p) => [p.code, p.id]));
  const roleByCode = Object.fromEntries(roleRecords.map((r) => [r.code, r.id]));
  const rolePermissions = [];
  for (const [roleCode, codes] of Object.entries(rolePermMap)) {
    for (const code of codes) {
      rolePermissions.push({ roleId: roleByCode[roleCode], permissionId: permByCode[code] });
    }
  }
  await RolePermission.bulkCreate(rolePermissions);

  // RBAC：用户-角色关联（按现有用户的 role 映射）
  const seededUsers = await User.findAll();
  const userRoleMap = { admin: 'admin', manager: 'manager', operator: 'operator', finance: 'finance' };
  const userRoles = [];
  for (const u of seededUsers) {
    const rc = userRoleMap[u.role] || 'operator';
    userRoles.push({ userId: u.id, roleId: roleByCode[rc] });
  }
  await UserRole.bulkCreate(userRoles);

  console.log('演示数据初始化完成');
  console.log('登录账号: admin / 123456（另含 manager / operator / finance）');
  process.exit(0);
}

seed().catch((e) => {
  console.error('初始化失败:', e);
  process.exit(1);
});