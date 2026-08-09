'use strict';

// port 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
const legacyModule = require('../port.js');

module.exports = {
  name: 'port',
  title: '港口专项',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  events: legacyModule.events || [],
  autoMount: false,
};