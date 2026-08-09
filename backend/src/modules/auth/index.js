'use strict';

// auth 模块 —— 存量扁平模块的协议化包装（架构解耦 E7）
// 路由已在 src/routes/index.js 注册，此处仅登记元信息，autoMount:false 防止重复挂载。
const legacyModule = require('../auth.js');

module.exports = {
  name: 'auth',
  title: '认证与权限',
  dependencies: [],
  models: legacyModule.models || [],
  routes: legacyModule.routes,
  services: {},
  seed: undefined,
  events: legacyModule.events || [],
  autoMount: false,
};