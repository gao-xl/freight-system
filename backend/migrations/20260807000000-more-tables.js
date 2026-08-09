'use strict';

// 扩展基线迁移：创建 25 张原本只由 sequelize.sync() 从模型建的表
// 用于生产环境（PostgreSQL）的规范建表路径；本地开发仍可用 sequelize.sync() 快速建表。
// 说明：
//   1) 字段定义与 src/models/*.js 一一对应（ENUM 严格转录模型取值；金额一律 DECIMAL，不用 FLOAT）。
//   2) 本迁移在 initial(20260807000000-initial.js) 之后、data-scope-columns 之前执行，
//      故 Quotations / Invoices 会先把模型自身定义的 groupId/ownerId/version 建好；
//      data-scope-columns 迁移对这两张表会因 describeTable 已含该列而跳过（幂等）。
//   3) 外键 references 指向 initial 已建父表（Customers/Suppliers/Orders/Users/Bookings/FinanceRecords）
//      及本迁移新建的 Groups/Quotations；onDelete 语义：非空外键用 CASCADE（随父删除），
//      可空外键用 SET NULL（置空保留记录）；多对多中间表 UserGroups 用 CASCADE。
//   4) paranoid(软删除) 模型补 deletedAt；乐观锁模型补 version INTEGER default 0。
module.exports = {
  async up(queryInterface, Sequelize) {
    // ------------------------------------------------------------------ 小组
    await queryInterface.createTable('Groups', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(50), allowNull: false },
      code: { type: Sequelize.STRING(30), unique: true },
      description: { type: Sequelize.STRING(255) },
      ownerId: { type: Sequelize.INTEGER },
      status: { type: Sequelize.ENUM('active', 'disabled'), defaultValue: 'active' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 用户-小组（多对多中间表，随任一侧删除级联清理）
    await queryInterface.createTable('UserGroups', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      groupId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Groups', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 报价
    await queryInterface.createTable('Quotations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      quoteNo: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      customerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Customers', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      type: { type: Sequelize.ENUM('import', 'export', 'transit'), defaultValue: 'export' },
      mode: { type: Sequelize.ENUM('sea', 'air', 'land', 'rail'), defaultValue: 'sea' },
      serviceType: { type: Sequelize.ENUM('fcl', 'lcl', 'charter', 'express'), defaultValue: 'fcl' },
      originPort: { type: Sequelize.STRING(50) },
      destPort: { type: Sequelize.STRING(50) },
      originPlace: { type: Sequelize.STRING(100) },
      destPlace: { type: Sequelize.STRING(100) },
      cargoDesc: { type: Sequelize.STRING(255) },
      cargoWeight: { type: Sequelize.DECIMAL(12, 2) },
      cargoVolume: { type: Sequelize.DECIMAL(12, 2) },
      packageCount: { type: Sequelize.INTEGER },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      totalAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      costAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      profitAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      profitRate: { type: Sequelize.DECIMAL(6, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('draft', 'sent', 'confirmed', 'converted', 'expired', 'cancelled'), defaultValue: 'draft' },
      validUntil: { type: Sequelize.DATEONLY },
      salesId: { type: Sequelize.INTEGER, references: { model: 'Users', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      remark: { type: Sequelize.TEXT },
      groupId: { type: Sequelize.INTEGER }, // 数据隔离：归属小组（模型自带，照抄）
      ownerId: { type: Sequelize.INTEGER }, // 数据隔离：归属操作员（模型自带，照抄）
      version: { type: Sequelize.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
      isDemo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE }, // paranoid 软删除
    });

    await queryInterface.createTable('QuotationItems', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      quotationId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Quotations', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      name: { type: Sequelize.STRING(100), allowNull: false },
      category: { type: Sequelize.ENUM('ocean_freight', 'air_freight', 'local_charge', 'customs_fee', 'document_fee', 'warehouse_fee', 'transport_fee', 'other'), defaultValue: 'other' },
      direction: { type: Sequelize.ENUM('revenue', 'cost'), defaultValue: 'revenue' },
      unit: { type: Sequelize.STRING(20) },
      quantity: { type: Sequelize.DECIMAL(12, 2), defaultValue: 1 },
      unitPrice: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      costPrice: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      supplierId: { type: Sequelize.INTEGER, references: { model: 'Suppliers', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      sortOrder: { type: Sequelize.INTEGER, defaultValue: 0 },
      isDemo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 客户跟进
    await queryInterface.createTable('CustomerFollows', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Customers', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      operatorId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Users', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } }, // 跟进人
      type: { type: Sequelize.ENUM('call', 'visit', 'email', 'wechat', 'quotation', 'order', 'meeting', 'other'), defaultValue: 'call' },
      content: { type: Sequelize.TEXT, allowNull: false },     // 跟进内容
      nextFollowAt: { type: Sequelize.DATE },                  // 下次跟进时间
      status: { type: Sequelize.ENUM('open', 'done'), defaultValue: 'done' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 外部对接配置
    await queryInterface.createTable('IntegrationConfigs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(50), allowNull: false },
      baseUrl: { type: Sequelize.STRING(255) },
      apiKey: { type: Sequelize.STRING(255) },
      authType: { type: Sequelize.ENUM('none', 'api_key', 'basic', 'oauth2'), defaultValue: 'api_key' },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: false },
      config: { type: Sequelize.TEXT },
      lastSyncAt: { type: Sequelize.DATE },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 青岛港节点
    await queryInterface.createTable('QingdaoNodes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Orders', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      bookingId: { type: Sequelize.INTEGER, references: { model: 'Bookings', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      node: {
        type: Sequelize.ENUM('picked_up', 'loaded', 'arrived_port', 'manifest_report', 'customs_release', 'loading_manifest', 'loaded_on_board', 'departed'),
        allowNull: false,
      },
      status: { type: Sequelize.ENUM('pending', 'done', 'warning', 'blocked'), defaultValue: 'pending' },
      eventTime: { type: Sequelize.DATE },
      detail: { type: Sequelize.STRING(255) },
      source: { type: Sequelize.ENUM('manual', 'api', 'edi'), defaultValue: 'manual' },
      operator: { type: Sequelize.STRING(50) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('QingdaoNodes', ['orderId', 'node'], { unique: true, name: 'qingdao_nodes_order_node' }); // 每订单每节点一条最新状态

    // ------------------------------------------------------------------ 预警记录
    await queryInterface.createTable('AlertRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      type: { type: Sequelize.ENUM('eta_soon', 'vessel_change', 'customs_deadline', 'overdue_receivable', 'cutoff_time', 'manifest', 'blocked'), allowNull: false },
      level: { type: Sequelize.ENUM('info', 'warning', 'danger'), defaultValue: 'warning' },
      orderId: { type: Sequelize.INTEGER, references: { model: 'Orders', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      bookingId: { type: Sequelize.INTEGER },
      financeId: { type: Sequelize.INTEGER },
      title: { type: Sequelize.STRING(100) },
      message: { type: Sequelize.TEXT },
      dueAt: { type: Sequelize.DATE },
      status: { type: Sequelize.ENUM('active', 'resolved', 'ignored'), defaultValue: 'active' },
      resolvedAt: { type: Sequelize.DATE },
      dedupKey: { type: Sequelize.STRING(80) }, // 去重键：同一业务对象同类型同批次只保留一条
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('AlertRecords', ['dedupKey'], { unique: true, name: 'alert_records_dedup_key' });

    // ------------------------------------------------------------------ 审计日志
    await queryInterface.createTable('AuditLogs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER },
      username: { type: Sequelize.STRING(50) },
      module: { type: Sequelize.STRING(30) },
      action: { type: Sequelize.STRING(30) },
      method: { type: Sequelize.STRING(10) },
      path: { type: Sequelize.STRING(120) },
      targetId: { type: Sequelize.STRING(30) },
      summary: { type: Sequelize.STRING(255) },
      ip: { type: Sequelize.STRING(45) },
      userAgent: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 场站记录
    await queryInterface.createTable('YardRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, references: { model: 'Orders', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      containerNo: { type: Sequelize.STRING(30) },
      billNo: { type: Sequelize.STRING(50) },
      yardCode: { type: Sequelize.STRING(30) },
      yardName: { type: Sequelize.STRING(50) },
      status: { type: Sequelize.STRING(30) },
      location: { type: Sequelize.STRING(100) },
      eventTime: { type: Sequelize.DATE },
      source: { type: Sequelize.ENUM('api', 'scraper', 'manual'), defaultValue: 'manual' },
      raw: { type: Sequelize.TEXT },
      queryBy: { type: Sequelize.INTEGER }, // 查询人
      queryAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 场站名录
    await queryInterface.createTable('YardMetas', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(30), unique: true },
      name: { type: Sequelize.STRING(50) },
      mode: { type: Sequelize.ENUM('api', 'scraper', 'manual'), defaultValue: 'manual' },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 汇率
    await queryInterface.createTable('ExchangeRates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      baseCurrency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      targetCurrency: { type: Sequelize.STRING(10) },
      rate: { type: Sequelize.DECIMAL(20, 6) },
      rateDate: { type: Sequelize.DATEONLY },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('ExchangeRates', ['baseCurrency', 'targetCurrency', 'rateDate'], { unique: true, name: 'exchange_rates_base_target_date' });

    // ------------------------------------------------------------------ 打印模板
    await queryInterface.createTable('PrintTemplates', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      docType: { type: Sequelize.ENUM('bl', 'invoice', 'packing_list', 'quotation', 'customs', 'statement', 'order', 'settlement', 'debit_note'), allowNull: false },
      content: { type: Sequelize.TEXT },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      pageSize: { type: Sequelize.STRING(20), defaultValue: 'A4' },
      logoUrl: { type: Sequelize.STRING(255) },
      header: { type: Sequelize.TEXT },
      footer: { type: Sequelize.TEXT },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 发票
    await queryInterface.createTable('Invoices', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      invoiceNo: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      invoiceType: { type: Sequelize.ENUM('payable', 'receivable'), allowNull: false },
      orderId: { type: Sequelize.INTEGER, references: { model: 'Orders', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      customerId: { type: Sequelize.INTEGER, references: { model: 'Customers', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } }, // 应收开票对象
      supplierId: { type: Sequelize.INTEGER, references: { model: 'Suppliers', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } }, // 应付开票对象
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      taxRate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      taxAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      totalAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      items: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('draft', 'issued', 'paid', 'cancelled'), defaultValue: 'draft' },
      issuedAt: { type: Sequelize.DATE },
      remark: { type: Sequelize.TEXT },
      createdBy: { type: Sequelize.INTEGER },
      groupId: { type: Sequelize.INTEGER }, // 数据隔离：归属小组（模型自带，照抄）
      ownerId: { type: Sequelize.INTEGER }, // 数据隔离：归属操作员（模型自带，照抄）
      version: { type: Sequelize.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE }, // paranoid 软删除
    });

    // ------------------------------------------------------------------ 放单记录
    await queryInterface.createTable('ReleaseRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Orders', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      releaseType: { type: Sequelize.ENUM('original', 'telex', 'seaway'), defaultValue: 'original' },
      releaseNo: { type: Sequelize.STRING(50) },
      operatorId: { type: Sequelize.INTEGER }, // 操作人
      operatorName: { type: Sequelize.STRING(50) },
      approvalStatus: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
      approverId: { type: Sequelize.INTEGER },
      approverName: { type: Sequelize.STRING(50) },
      approvedAt: { type: Sequelize.DATE },
      receivableBalance: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 流程节点模板
    await queryInterface.createTable('FlowNodes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bizType: { type: Sequelize.ENUM('import', 'export'), allowNull: false },
      nodeCode: { type: Sequelize.STRING(40), allowNull: false },
      nodeName: { type: Sequelize.STRING(50), allowNull: false },
      sort: { type: Sequelize.INTEGER, defaultValue: 0 },
      required: { type: Sequelize.BOOLEAN, defaultValue: false },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 订单实例节点
    await queryInterface.createTable('OrderNodes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Orders', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      nodeCode: { type: Sequelize.STRING(40), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'done', 'blocked'), defaultValue: 'pending' },
      doneAt: { type: Sequelize.DATE },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 自定义字段
    await queryInterface.createTable('CustomFields', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bizType: { type: Sequelize.ENUM('order', 'customer', 'booking', 'finance'), allowNull: false },
      fieldKey: { type: Sequelize.STRING(50), allowNull: false },
      label: { type: Sequelize.STRING(50), allowNull: false },
      fieldType: { type: Sequelize.ENUM('string', 'number', 'date', 'enum', 'bool'), defaultValue: 'string' },
      options: { type: Sequelize.TEXT },
      required: { type: Sequelize.BOOLEAN, defaultValue: false },
      isList: { type: Sequelize.BOOLEAN, defaultValue: false },
      enabled: { type: Sequelize.BOOLEAN, defaultValue: true },
      sort: { type: Sequelize.INTEGER, defaultValue: 10 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 一单多箱
    await queryInterface.createTable('OrderContainers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Orders', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
      containerNo: { type: Sequelize.STRING(20), allowNull: false },
      sealNo: { type: Sequelize.STRING(20) },
      sizeType: { type: Sequelize.ENUM('20', '40', '40HQ', '45', '20RF', '40RF'), defaultValue: '40' },
      cargoDesc: { type: Sequelize.STRING(255) },
      weight: { type: Sequelize.DECIMAL(12, 2) },
      volume: { type: Sequelize.DECIMAL(12, 2) },
      packageCount: { type: Sequelize.INTEGER },
      status: { type: Sequelize.ENUM('planned', 'gate_in', 'loaded', 'arrived', 'delivered'), defaultValue: 'planned' },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ EDI 报文
    await queryInterface.createTable('EdiMessages', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      direction: { type: Sequelize.ENUM('out', 'in'), allowNull: false },
      channel: { type: Sequelize.STRING(30), defaultValue: 'edi' },
      messageType: { type: Sequelize.STRING(30) },
      counterparty: { type: Sequelize.INTEGER }, // 关联供应商
      orderId: { type: Sequelize.INTEGER, references: { model: 'Orders', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      referenceNo: { type: Sequelize.STRING(50) },
      rawContent: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('pending', 'sent', 'received', 'acknowledged', 'failed'), defaultValue: 'pending' },
      error: { type: Sequelize.TEXT },
      sentAt: { type: Sequelize.DATE },
      receivedAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 支付交易
    await queryInterface.createTable('PaymentTransactions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      txNo: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      channel: { type: Sequelize.STRING(30), defaultValue: 'usd_pay' },
      type: { type: Sequelize.ENUM('outward', 'inward'), defaultValue: 'outward' },
      financeId: { type: Sequelize.INTEGER },
      orderId: { type: Sequelize.INTEGER, references: { model: 'Orders', key: 'id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      beneficiary: { type: Sequelize.STRING(100) },
      beneficiaryBank: { type: Sequelize.STRING(100) },
      status: { type: Sequelize.ENUM('draft', 'pending', 'processing', 'success', 'failed', 'cancelled'), defaultValue: 'draft' },
      externalRef: { type: Sequelize.STRING(50) },
      error: { type: Sequelize.STRING(255) },
      paidAt: { type: Sequelize.DATE },
      version: { type: Sequelize.INTEGER, defaultValue: 0 }, // P3.7 乐观锁
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
      deletedAt: { type: Sequelize.DATE }, // paranoid 软删除
    });

    // ------------------------------------------------------------------ 公司信息
    await queryInterface.createTable('CompanyProfiles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      companyName: { type: Sequelize.STRING(120), allowNull: false, defaultValue: '' },
      shortName: { type: Sequelize.STRING(60), defaultValue: '' },
      enName: { type: Sequelize.STRING(200), defaultValue: '' },
      legalPerson: { type: Sequelize.STRING(50), defaultValue: '' },
      taxNo: { type: Sequelize.STRING(50), defaultValue: '' },
      address: { type: Sequelize.STRING(255), defaultValue: '' },
      phone: { type: Sequelize.STRING(50), defaultValue: '' },
      fax: { type: Sequelize.STRING(50), defaultValue: '' },
      email: { type: Sequelize.STRING(100), defaultValue: '' },
      website: { type: Sequelize.STRING(100), defaultValue: '' },
      description: { type: Sequelize.TEXT },
      defaultCurrency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'CNY' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 部门
    await queryInterface.createTable('Departments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(50), allowNull: false },
      code: { type: Sequelize.STRING(30), unique: true },
      parentId: { type: Sequelize.INTEGER, defaultValue: 0 }, // 上级部门（0 为顶层）
      leaderId: { type: Sequelize.INTEGER }, // 负责人
      sort: { type: Sequelize.INTEGER, defaultValue: 0 },
      status: { type: Sequelize.ENUM('active', 'disabled'), defaultValue: 'active' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 公司银行账号
    await queryInterface.createTable('CompanyAccounts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      accountName: { type: Sequelize.STRING(120), allowNull: false },
      accountNo: { type: Sequelize.STRING(50), allowNull: false },
      bankName: { type: Sequelize.STRING(120) },
      bankBranch: { type: Sequelize.STRING(200) },
      currency: { type: Sequelize.ENUM('CNY', 'USD', 'EUR', 'HKD', 'JPY', 'OTHER'), defaultValue: 'CNY' },
      accountType: { type: Sequelize.ENUM('receive', 'pay', 'both'), defaultValue: 'receive' },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      status: { type: Sequelize.ENUM('active', 'disabled'), defaultValue: 'active' },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // ------------------------------------------------------------------ 开票/单证抬头
    await queryInterface.createTable('InvoiceTitles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      titleName: { type: Sequelize.STRING(120), allowNull: false },
      taxNo: { type: Sequelize.STRING(50) },
      address: { type: Sequelize.STRING(255) },
      phone: { type: Sequelize.STRING(50) },
      bankName: { type: Sequelize.STRING(120) },
      accountNo: { type: Sequelize.STRING(50) },
      isDefault: { type: Sequelize.BOOLEAN, defaultValue: false },
      status: { type: Sequelize.ENUM('active', 'disabled'), defaultValue: 'active' },
      remark: { type: Sequelize.STRING(255) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  // 按建表相反顺序 dropTable。
  // 无回滚例外：所有 25 张表均可安全删除；Quotations/Invoices 的 groupId/ownerId 由本迁移随表创建，
  // 因此 data-scope-columns 迁移的 down（removeColumn）虽会尝试删除，但因列已不存在而静默跳过，
  // 不会与本次回滚冲突。
  async down(queryInterface) {
    const tables = [
      'InvoiceTitles',
      'CompanyAccounts',
      'Departments',
      'CompanyProfiles',
      'PaymentTransactions',
      'EdiMessages',
      'OrderContainers',
      'CustomFields',
      'OrderNodes',
      'FlowNodes',
      'ReleaseRecords',
      'Invoices',
      'PrintTemplates',
      'ExchangeRates',
      'YardMetas',
      'YardRecords',
      'AuditLogs',
      'AlertRecords',
      'QingdaoNodes',
      'IntegrationConfigs',
      'CustomerFollows',
      'QuotationItems',
      'Quotations',
      'UserGroups',
      'Groups',
    ];
    for (const t of tables) await queryInterface.dropTable(t);
  },
};