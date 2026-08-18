'use strict';

/** 补建 Phase 1/2/3 新增模型的生产迁移
 * 覆盖：QuotationTemplate(报价模板)、HsCode(HS编码库)、PortalSubscription(客户通知订阅)、
 *       Budget/BudgetLine/BudgetAdjustment(预算管理)。
 * 开发环境在启动时已由 sync 建表，本迁移以表存在性兜底、幂等为空跑；生产环境由本迁移保障表结构。
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 表存在则跳过（开发环境 sync 已建；生产环境首次执行时建）
    const tableExists = async (name) => {
      const r = await queryInterface.sequelize.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='${name}'`,
        { type: Sequelize.QueryTypes.SELECT },
      );
      return r.length > 0;
    };

    // ── 报价模板 ──
    if (!(await tableExists('QuotationTemplates'))) {
      await queryInterface.createTable('QuotationTemplates', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(100), allowNull: false },
        type: { type: Sequelize.ENUM('import', 'export', 'transit'), defaultValue: 'export' },
        mode: { type: Sequelize.ENUM('sea', 'air', 'land', 'rail'), defaultValue: 'sea' },
        serviceType: { type: Sequelize.ENUM('fcl', 'lcl', 'charter', 'express'), defaultValue: 'fcl' },
        originPort: { type: Sequelize.STRING(50) },
        destPort: { type: Sequelize.STRING(50) },
        currency: { type: Sequelize.STRING(10), defaultValue: 'USD' },
        items: { type: Sequelize.TEXT },
        groupId: { type: Sequelize.INTEGER },
        ownerId: { type: Sequelize.INTEGER },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('QuotationTemplates', ['type']);
      await queryInterface.addIndex('QuotationTemplates', ['groupId']);
    }

    // ── HS 编码知识库 ──
    if (!(await tableExists('HsCodes'))) {
      await queryInterface.createTable('HsCodes', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        code: { type: Sequelize.STRING(20), allowNull: false },
        name: { type: Sequelize.STRING(500), allowNull: false },
        chapter: { type: Sequelize.STRING(4) },
        heading: { type: Sequelize.STRING(6) },
        exportRate: { type: Sequelize.DECIMAL(6, 4), defaultValue: 0 },
        importRate: { type: Sequelize.DECIMAL(6, 4), defaultValue: 0 },
        vatRate: { type: Sequelize.DECIMAL(6, 4), defaultValue: 0 },
        unit: { type: Sequelize.STRING(20) },
        supervision: { type: Sequelize.STRING(100) },
        isCommon: { type: Sequelize.BOOLEAN, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('HsCodes', ['code'], { unique: true });
      await queryInterface.addIndex('HsCodes', ['chapter']);
    }

    // ── 客户通知订阅偏好 ──
    if (!(await tableExists('PortalSubscriptions'))) {
      await queryInterface.createTable('PortalSubscriptions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        customerId: { type: Sequelize.INTEGER, allowNull: false },
        category: { type: Sequelize.STRING(30), allowNull: false },
        channel: { type: Sequelize.STRING(30), allowNull: false },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        email: { type: Sequelize.STRING(120) },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('PortalSubscriptions', ['customerId', 'category', 'channel'], { unique: true });
    }

    // ── 预算表头 ──
    if (!(await tableExists('Budgets'))) {
      await queryInterface.createTable('Budgets', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(120), allowNull: false },
        year: { type: Sequelize.INTEGER, allowNull: false },
        periodType: { type: Sequelize.ENUM('year', 'quarter', 'month'), allowNull: false, defaultValue: 'year' },
        period: { type: Sequelize.STRING(16), allowNull: false },
        departmentId: { type: Sequelize.INTEGER },
        direction: { type: Sequelize.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' },
        status: { type: Sequelize.ENUM('draft', 'approved', 'closed'), allowNull: false, defaultValue: 'draft' },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        description: { type: Sequelize.TEXT },
        groupId: { type: Sequelize.INTEGER },
        ownerId: { type: Sequelize.INTEGER },
        creatorId: { type: Sequelize.INTEGER },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('Budgets', ['year', 'periodType']);
      await queryInterface.addIndex('Budgets', ['departmentId']);
      await queryInterface.addIndex('Budgets', ['status']);
    }

    // ── 预算明细行 ──
    if (!(await tableExists('BudgetLines'))) {
      await queryInterface.createTable('BudgetLines', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        budgetId: { type: Sequelize.INTEGER, allowNull: false },
        direction: { type: Sequelize.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' },
        category: { type: Sequelize.STRING(30), allowNull: false },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        currency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'CNY' },
        note: { type: Sequelize.STRING(255) },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('BudgetLines', ['budgetId', 'direction', 'category'], { unique: true });
    }

    // ── 预算调整审批 ──
    if (!(await tableExists('BudgetAdjustments'))) {
      await queryInterface.createTable('BudgetAdjustments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        budgetId: { type: Sequelize.INTEGER, allowNull: false },
        direction: { type: Sequelize.ENUM('revenue', 'cost'), allowNull: false, defaultValue: 'revenue' },
        category: { type: Sequelize.STRING(30), allowNull: false },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        reason: { type: Sequelize.STRING(255), allowNull: false },
        status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
        requestedBy: { type: Sequelize.INTEGER },
        requestedAt: { type: Sequelize.DATE },
        approvedBy: { type: Sequelize.INTEGER },
        approvedAt: { type: Sequelize.DATE },
        rejectReason: { type: Sequelize.STRING(255) },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex('BudgetAdjustments', ['budgetId', 'status']);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('BudgetAdjustments');
    await queryInterface.dropTable('BudgetLines');
    await queryInterface.dropTable('Budgets');
    await queryInterface.dropTable('PortalSubscriptions');
    await queryInterface.dropTable('HsCodes');
    await queryInterface.dropTable('QuotationTemplates');
  },
};