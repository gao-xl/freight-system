// 港口模块（增值）
const { QingdaoNode, YardMeta, YardRecord } = require('../models');
const { guard } = require('../middleware/auth');

module.exports = {
  name: 'port',
  title: '港口专项',
  dependencies: ['order', 'integration'],
  models: [QingdaoNode, YardMeta, YardRecord],
  routes(router, mw) {
    // 港口路由已挂在 integration 模块中（避免重复）
  },
  services: {},
  menu: null,
  events: [],
};
