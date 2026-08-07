// 订单模块 —— 核心中枢
const { Order, OrderContainer, OrderNode, ReleaseRecord } = require('../models');
const { guard } = require('../middleware/auth');
const orderController = require('../controllers/orderController');
const containerController = require('../controllers/containerController');
const releaseController = require('../controllers/releaseController');
const flowController = require('../controllers/flowController');

module.exports = {
  name: 'order',
  title: '订单管理',
  dependencies: ['customer', 'supplier'],
  models: [Order, OrderContainer, OrderNode, ReleaseRecord],
  routes(router, mw) {
    const g = (...args) => guard('order', ...args);
    // 订单 CRUD
    router.get('/orders', g('read'), orderController.list);
    router.get('/orders/:id', g('read'), orderController.get);
    router.post('/orders', g('create'), orderController.create);
    router.put('/orders/:id', g('update'), orderController.update);
    router.delete('/orders/:id', g('delete'), orderController.remove);
    // 批量操作
    router.post('/orders/batch-delete', g('delete'), orderController.batchRemove);
    router.post('/orders/batch-update', g('update'), orderController.batchUpdate);
    router.post('/orders/batch-advance', g('update'), orderController.batchAdvance);
    router.post('/orders/batch-status', g('update'), orderController.batchStatus);
    // 详情/时间线/流转/毛利
    router.get('/orders/:id/detail', g('read'), orderController.detail);
    router.get('/orders/:id/timeline', g('read'), orderController.timeline);
    router.get('/orders/:id/flow', g('read'), orderController.flow);
    router.get('/orders/:id/profit', g('read'), orderController.profit);
    router.get('/orders/export', g('read'), orderController.export);
    router.get('/orders/profit-summary', g('read'), orderController.profitSummary);
    router.post('/orders/:id/advance', g('update'), orderController.advance);
    // 箱号管理
    router.get('/orders/:orderId/containers', g('read'), containerController.list);
    router.put('/orders/:orderId/containers', g('update'), containerController.update);
    router.get('/containers', g('read'), containerController.all);
    router.get('/containers/:id', g('read'), containerController.get);
    router.delete('/containers/:id', g('delete'), containerController.remove);
    // 放单控制
    router.get('/release', g('read'), releaseController.list);
    router.get('/release/orders/:id', g('read'), releaseController.byOrder);
    router.post('/orders/:id/release', g('create'), releaseController.create);
    router.post('/release/:id/approve', g('approve'), releaseController.approve);
    // 流程节点
    router.get('/flow-nodes', g('read'), flowController.list);
    router.put('/flow-nodes/:id', g('update'), flowController.update);
    router.get('/flow-stats', g('read'), flowController.stats);
    router.get('/orders/:id/nodes', g('read'), flowController.orderNodes);
    router.put('/orders/:id/nodes/:nodeCode', g('update'), flowController.updateNode);
  },
  services: {},
  menu: { path: '/orders', icon: 'Document', permission: 'order:read' },
  events: ['order.created', 'order.updated', 'order.deleted', 'order.transitioned'],
};
