'use strict';

// supplier 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../supplier.js');

module.exports = {
  name: 'supplier',
  title: '供应商管理',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};