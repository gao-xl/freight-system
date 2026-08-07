// 报关模块
const { CustomsDeclaration } = require('../models');
const { guard } = require('../middleware/auth');
const customsController = require('../controllers/customsController');

module.exports = {
  name: 'customs',
  title: '报关管理',
  dependencies: ['order'],
  models: [CustomsDeclaration],
  routes(router, mw) {
    const g = (...args) => guard('customs', ...args);
    router.get('/customs', g('read'), customsController.list);
    router.get('/customs/:id', g('read'), customsController.get);
    router.post('/customs', g('create'), customsController.create);
    router.put('/customs/:id', g('update'), customsController.update);
    router.delete('/customs/:id', g('delete'), customsController.remove);
  },
  services: {},
  menu: { path: '/customs', icon: 'Files', permission: 'customs:read' },
  events: ['customs.created', 'customs.updated', 'customs.deleted'],
};
