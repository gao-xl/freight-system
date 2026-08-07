'use strict';

// 基线迁移：创建核心表结构
// 说明：本迁移用于生产环境（PostgreSQL）的规范建表路径。
// 本地开发仍可用 sequelize.sync() 快速建表；两者 schema 保持一致。
module.exports = {
  async up(queryInterface, Sequelize) {
    // 用户
    await queryInterface.createTable('Users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      name: { type: Sequelize.STRING(50), allowNull: false },
      role: { type: Sequelize.STRING(20), defaultValue: 'operator' },
      email: { type: Sequelize.STRING(100) },
      phone: { type: Sequelize.STRING(30) },
      status: { type: Sequelize.STRING(20), defaultValue: 'active' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 角色
    await queryInterface.createTable('Roles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(50), allowNull: false },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(200) },
      dataScope: { type: Sequelize.STRING(20), defaultValue: 'all' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 权限
    await queryInterface.createTable('Permissions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      module: { type: Sequelize.STRING(50), allowNull: false },
      action: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(100) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 用户-角色
    await queryInterface.createTable('UserRoles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      roleId: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 角色-权限
    await queryInterface.createTable('RolePermissions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      roleId: { type: Sequelize.INTEGER, allowNull: false },
      permissionId: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 客户
    await queryInterface.createTable('Customers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(30) },
      name: { type: Sequelize.STRING(100), allowNull: false },
      shortName: { type: Sequelize.STRING(50) },
      type: { type: Sequelize.STRING(20), defaultValue: 'shipper' },
      level: { type: Sequelize.STRING(10), defaultValue: 'C' },
      contact: { type: Sequelize.STRING(50) },
      phone: { type: Sequelize.STRING(30) },
      email: { type: Sequelize.STRING(100) },
      address: { type: Sequelize.STRING(255) },
      creditLimit: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      businessScope: { type: Sequelize.STRING(255) },
      taxNo: { type: Sequelize.STRING(50) },
      remark: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING(20), defaultValue: 'active' },
      lastFollowAt: { type: Sequelize.DATE },
      nextFollowAt: { type: Sequelize.DATE },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 供应商
    await queryInterface.createTable('Suppliers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(30) },
      name: { type: Sequelize.STRING(100), allowNull: false },
      category: { type: Sequelize.STRING(30), defaultValue: 'carrier' },
      contact: { type: Sequelize.STRING(50) },
      phone: { type: Sequelize.STRING(30) },
      email: { type: Sequelize.STRING(100) },
      address: { type: Sequelize.STRING(255) },
      ports: { type: Sequelize.STRING(255) },
      contractNo: { type: Sequelize.STRING(50) },
      paymentTerms: { type: Sequelize.STRING(100) },
      remark: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING(20), defaultValue: 'active' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 订单
    await queryInterface.createTable('Orders', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderNo: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      customerId: { type: Sequelize.INTEGER, allowNull: false },
      type: { type: Sequelize.STRING(20), defaultValue: 'export' },
      mode: { type: Sequelize.STRING(20), defaultValue: 'sea' },
      serviceType: { type: Sequelize.STRING(20), defaultValue: 'fcl' },
      status: { type: Sequelize.STRING(20), defaultValue: 'draft' },
      originPort: { type: Sequelize.STRING(50) },
      destPort: { type: Sequelize.STRING(50) },
      originPlace: { type: Sequelize.STRING(100) },
      destPlace: { type: Sequelize.STRING(100) },
      cargoDesc: { type: Sequelize.STRING(255) },
      cargoWeight: { type: Sequelize.DECIMAL(12, 2) },
      cargoVolume: { type: Sequelize.DECIMAL(12, 2) },
      packageCount: { type: Sequelize.INTEGER },
      containerNo: { type: Sequelize.STRING(50) },
      etd: { type: Sequelize.DATEONLY },
      eta: { type: Sequelize.DATEONLY },
      terminal: { type: Sequelize.STRING(20) },
      openTime: { type: Sequelize.DATE },
      cutoffTime: { type: Sequelize.DATE },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      totalAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      quotationId: { type: Sequelize.INTEGER },
      salesId: { type: Sequelize.INTEGER },
      releaseStatus: { type: Sequelize.STRING(20), defaultValue: 'none' },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 订舱
    await queryInterface.createTable('Bookings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bookingNo: { type: Sequelize.STRING(40) },
      orderId: { type: Sequelize.INTEGER, allowNull: false },
      supplierId: { type: Sequelize.INTEGER },
      vesselName: { type: Sequelize.STRING(80) },
      voyageNo: { type: Sequelize.STRING(40) },
      flightNo: { type: Sequelize.STRING(40) },
      containerType: { type: Sequelize.STRING(20) },
      containerQty: { type: Sequelize.INTEGER },
      teu: { type: Sequelize.DECIMAL(12, 2) },
      status: { type: Sequelize.STRING(20), defaultValue: 'new' },
      bookingDate: { type: Sequelize.DATEONLY },
      etd: { type: Sequelize.DATEONLY },
      eta: { type: Sequelize.DATEONLY },
      freightCharge: { type: Sequelize.DECIMAL(15, 2) },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 报关
    await queryInterface.createTable('CustomsDeclarations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      declNo: { type: Sequelize.STRING(40) },
      orderId: { type: Sequelize.INTEGER, allowNull: false },
      supplierId: { type: Sequelize.INTEGER },
      type: { type: Sequelize.STRING(30), defaultValue: 'export_clearance' },
      status: { type: Sequelize.STRING(20), defaultValue: 'prepared' },
      customsNo: { type: Sequelize.STRING(50) },
      hsCode: { type: Sequelize.STRING(20) },
      customsValue: { type: Sequelize.DECIMAL(15, 2) },
      taxAmount: { type: Sequelize.DECIMAL(15, 2) },
      inspectionResult: { type: Sequelize.STRING(255) },
      submitDate: { type: Sequelize.DATEONLY },
      releaseDate: { type: Sequelize.DATEONLY },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 单证
    await queryInterface.createTable('Documents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      docType: { type: Sequelize.STRING(30), defaultValue: 'bl' },
      docNo: { type: Sequelize.STRING(50) },
      orderId: { type: Sequelize.INTEGER },
      title: { type: Sequelize.STRING(100) },
      status: { type: Sequelize.STRING(20), defaultValue: 'draft' },
      filePath: { type: Sequelize.STRING(255) },
      originalName: { type: Sequelize.STRING(200) },
      mimeType: { type: Sequelize.STRING(100) },
      issuedBy: { type: Sequelize.STRING(50) },
      issueDate: { type: Sequelize.DATEONLY },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 运输跟踪
    await queryInterface.createTable('ShipmentTracks', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER, allowNull: false },
      bookingId: { type: Sequelize.INTEGER },
      stage: { type: Sequelize.STRING(20), defaultValue: 'booked' },
      location: { type: Sequelize.STRING(100) },
      description: { type: Sequelize.STRING(255) },
      eventTime: { type: Sequelize.DATE },
      operator: { type: Sequelize.STRING(50) },
      remark: { type: Sequelize.TEXT },
      auto: { type: Sequelize.BOOLEAN, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 财务流水
    await queryInterface.createTable('FinanceRecords', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      orderId: { type: Sequelize.INTEGER },
      direction: { type: Sequelize.STRING(20), allowNull: false },
      category: { type: Sequelize.STRING(30) },
      description: { type: Sequelize.STRING(255) },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
      rate: { type: Sequelize.DECIMAL(15, 6) },
      status: { type: Sequelize.STRING(20), defaultValue: 'unpaid' },
      counterpartyId: { type: Sequelize.INTEGER },
      invoiceNo: { type: Sequelize.STRING(50) },
      paidAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      dueDate: { type: Sequelize.DATEONLY },
      remark: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    const tables = [
      'FinanceRecords', 'ShipmentTracks', 'Documents', 'CustomsDeclarations',
      'Bookings', 'Orders', 'Suppliers', 'Customers',
      'RolePermissions', 'UserRoles', 'Permissions', 'Roles', 'Users',
    ];
    for (const t of tables) await queryInterface.dropTable(t);
  },
};