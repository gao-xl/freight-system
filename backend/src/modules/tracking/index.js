'use strict';

// tracking 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../tracking.js');

module.exports = {
  name: 'tracking',
  title: '运输跟踪',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  menu: legacyModule.menu || null,
  events: legacyModule.events || [],
  autoMount: false,
};