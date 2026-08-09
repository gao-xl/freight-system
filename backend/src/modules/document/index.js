'use strict';

// document 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../document.js');

module.exports = {
  name: 'document',
  title: '单证管理',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};