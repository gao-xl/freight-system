// 模块索引 —— 统一注册全部业务模块
// 按 ModuleRegistry 协议导出，ModuleRegistry.load() 统一加载

const { ModuleRegistry } = require('../services/moduleRegistry');

// ── 基础模块（无依赖，最先加载）──
const authModule = require('./auth');
const customerModule = require('./customer');
const supplierModule = require('./supplier');

// ── 业务模块（依赖基础模块）──
const orderModule = require('./order');
const bookingModule = require('./booking');
const customsModule = require('./customs');
const documentModule = require('./document');
const trackingModule = require('./tracking');
const financeModule = require('./finance');
const quotationModule = require('./quotation');

// ── 增值模块 ──
const integrationModule = require('./integration');
const portModule = require('./port');
const automationModule = require('./automation');

const ALL_MODULES = [
  authModule,
  customerModule,
  supplierModule,
  orderModule,
  bookingModule,
  customsModule,
  documentModule,
  trackingModule,
  financeModule,
  quotationModule,
  integrationModule,
  portModule,
  automationModule,
];

/**
 * 初始化全部模块
 * @param {Object} ctx - { router, middleware, sequelize }
 */
function initModules(ctx) {
  const result = ModuleRegistry.load(ALL_MODULES, ctx);
  return result;
}

/**
 * 执行全部模块 seed
 */
function seedAll() {
  return ModuleRegistry.seedAll();
}

/**
 * 获取模块元信息列表（供前端菜单/权限配置）
 */
function listModules() {
  return ModuleRegistry.list();
}

module.exports = { initModules, seedAll, listModules, ModuleRegistry };
