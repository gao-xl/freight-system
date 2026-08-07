// 客户模块
const { Router } = require('express');
const { Customer, CustomerFollow } = require('../models');
const { authRequired, requirePermission, guard } = require('../middleware/auth');
const customerController = require('../controllers/customerController');

module.exports = {
  name: 'customer',
  title: '客户管理',
  models: [Customer, CustomerFollow],
  routes(router, mw) {
    const g = (...args) => guard('customer', ...args);
    router.get('/customers', g('read'), customerController.list);
    router.get('/customers/stats', g('read'), customerController.stats);
    router.get('/customers/pending-follows', g('read'), customerController.pendingFollows);
    router.get('/customers/:id', g('read'), customerController.get);
    router.post('/customers', g('create'), customerController.create);
    router.put('/customers/:id', g('update'), customerController.update);
    router.delete('/customers/:id', g('delete'), customerController.remove);
    router.post('/customers/batch-delete', g('delete'), customerController.batchRemove);
    router.post('/customers/batch-update', g('update'), customerController.batchUpdate);
    router.get('/customers/:id/follows', g('read'), customerController.listFollows);
    router.post('/customers/:id/follows', g('create'), customerController.createFollow);
    router.get('/customers/import-template', g('read'), customerController.importTemplate);
    router.post('/customers/import', g('create'), customerController.import);
  },
  services: {},
  menu: { path: '/customers', icon: 'User', permission: 'customer:read' },
  events: ['customer.created', 'customer.updated', 'customer.deleted', 'customer.followed'],
};
