'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 官方示例插件 ②：qingdao-port（青岛港专项）
//
// 演示目标：「存量业务升级为插件」的完整范式
//   —— 把原本散落在 routes/index.js 的青岛港路由，收拢为独立插件目录，
//      通过模块注册协议（models + routes + menu + events）统一加载。
//
// 对应《二开指南》recipe 3 的进阶用法，以及执行总纲决策 4：
//   「青岛港降为官方示例插件，不进核心发行版；自己用可直接启用该插件。」
//
// 插件做了什么：
//   - models  : 青岛港专属模型（场站名录/场站记录/节点）随插件注册
//   - routes  : 5 个青岛港端点从 routes/index.js 迁移至此，由 mountRoutes 自动挂载
//   - menu    : 前端菜单入口（青岛港看板）
//   - events  : 声明青岛港节点更新事件（供其他插件订阅）
//   - services: 青岛港场站查询服务
// ─────────────────────────────────────────────────────────────────────────────

const qingdaoController = require('../../controllers/qingdaoController');
const qingdaoService = require('../../services/qingdaoService');
const { QingdaoNode, YardRecord, YardMeta } = require('../../models');

module.exports = {
  name: 'qingdao-port',
  title: '青岛港专项（官方示例插件）',
  dependencies: ['order', 'booking'],
  models: [QingdaoNode, YardRecord, YardMeta],
  events: ['qingdao.node_updated'],

  routes(router, mw = {}) {
    const guard = mw.guard || ((perm) => (req, res, next) => next());
    const g = (...args) => guard('qingdao', ...args);

    // 青岛港节点 / 检查清单 / 预警 / 舱单核验（迁移自 routes/index.js）
    router.get('/qingdao/nodes', g('read'), qingdaoController.nodes);
    router.post('/qingdao/nodes', g('update'), qingdaoController.updateNode);
    router.get('/qingdao/checklist', g('read'), qingdaoController.checklist);
    router.get('/qingdao/alerts', g('read'), qingdaoController.alerts);
    router.get('/qingdao/manifest/check', g('read'), qingdaoController.manifestCheck);
  },

  services: { qingdaoService },

  menu: { path: '/qingdao', icon: 'Ship', permission: 'qingdao:read' },
};
