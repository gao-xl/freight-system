'use strict';

// tracking 模块 —— 路由收敛（架构 P1-1）：
// 从 routes/index.js 迁出全部运输跟踪路由，改由 ModuleRegistry 自动挂载。
// 注意：权限点名为 'track'（与 seed.js 注册一致），非 'tracking'。
const { guard } = require('../../middleware/auth');
const trackController = require('../../controllers/trackController');

module.exports = {
  name: 'tracking',
  title: '运输跟踪',
  dependencies: ['order'],
  models: [],
  routes(router) {
    const g = (...args) => guard('track', ...args);
    router.get('/tracks', g('read'), trackController.list);
    router.get('/tracks/:id', g('read'), trackController.get);
    router.post('/tracks', g('create'), trackController.create);
    router.put('/tracks/:id', g('update'), trackController.update);
    router.delete('/tracks/:id', g('delete'), trackController.remove);
  },
  services: {},
  menu: { path: '/tracking', icon: 'Location', permission: 'tracking:read' },
  events: ['track.created', 'track.updated', 'track.deleted'],
};