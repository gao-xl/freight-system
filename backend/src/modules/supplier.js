// 供应商模块
const { Supplier } = require('../models');
const { guard } = require('../middleware/auth');
const supplierController = require('../controllers/supplierController');

module.exports = {
  name: 'supplier',
  title: '供应商管理',
  models: [Supplier],
  routes(router, mw) {
    const g = (...args) => guard('supplier', ...args);
    router.get('/suppliers', g('read'), supplierController.list);
    router.get('/suppliers/:id', g('read'), supplierController.get);
    router.post('/suppliers', g('create'), supplierController.create);
    router.put('/suppliers/:id', g('update'), supplierController.update);
    router.delete('/suppliers/:id', g('delete'), supplierController.remove);
    router.post('/suppliers/batch-delete', g('delete'), supplierController.batchRemove);
    router.post('/suppliers/batch-update', g('update'), supplierController.batchUpdate);
    router.get('/suppliers/import-template', g('read'), supplierController.importTemplate);
    router.post('/suppliers/import', g('create'), supplierController.import);
  },
  services: {},
  menu: { path: '/suppliers', icon: 'OfficeBuilding', permission: 'supplier:read' },
  events: ['supplier.created', 'supplier.updated', 'supplier.deleted'],
};
