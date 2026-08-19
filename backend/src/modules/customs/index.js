'use strict';

// customs 模块 —— 路由收敛（架构 P1-1）：从 routes/index.js 迁出全部报关路由，
// 守卫/校验与迁移前等价。
const { guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const S = require('../../validation/schemas');
const customsController = require('../../controllers/customsController');

module.exports = {
  name: 'customs',
  title: '报关管理',
  dependencies: ['order'],
  models: [],
  routes(router) {
    const g = (...args) => guard('customs', ...args);
    router.get('/customs', g('read'), customsController.list);
    router.get('/customs/:id', g('read'), customsController.get);
    router.post('/customs', g('create'), validate(S.customsCreate), customsController.create);
    router.put('/customs/:id', g('update'), validate(S.customsUpdate), customsController.update);
    router.delete('/customs/:id', g('delete'), customsController.remove);
  },
  services: {},
  menu: { path: '/customs', icon: 'Files', permission: 'customs:read' },
  events: ['customs.created', 'customs.updated', 'customs.deleted'],
};