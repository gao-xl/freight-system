'use strict';

// automation 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../automation.js');

module.exports = {
  name: 'automation',
  title: '自动化与系统',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};