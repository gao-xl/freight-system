'use strict';

// finance 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../finance.js');

module.exports = {
  name: 'finance',
  title: '财务管理',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};