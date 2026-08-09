'use strict';

// customs 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../customs.js');

module.exports = {
  name: 'customs',
  title: '报关管理',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};