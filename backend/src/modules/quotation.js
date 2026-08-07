// 报价模块
const { Quotation, QuotationItem } = require('../models');
const { guard } = require('../middleware/auth');
const quotationController = require('../controllers/quotationController');

module.exports = {
  name: 'quotation',
  title: '报价管理',
  dependencies: ['customer'],
  models: [Quotation, QuotationItem],
  routes(router, mw) {
    const g = (...args) => guard('quotation', ...args);
    router.get('/quotations', g('read'), quotationController.list);
    router.get('/quotations/stats', g('read'), quotationController.stats);
    router.get('/quotations/:id', g('read'), quotationController.get);
    router.post('/quotations', g('create'), quotationController.create);
    router.put('/quotations/:id', g('update'), quotationController.update);
    router.delete('/quotations/:id', g('delete'), quotationController.remove);
    router.post('/quotations/:id/send', g('update'), quotationController.send);
    router.post('/quotations/:id/confirm', g('update'), quotationController.confirm);
    router.post('/quotations/:id/convert-order', g('update'), quotationController.convertOrder);
  },
  services: {},
  menu: { path: '/quotations', icon: 'PriceTag', permission: 'quotation:read' },
  events: ['quotation.created', 'quotation.updated', 'quotation.deleted', 'quotation.confirmed', 'quotation.converted'],
};
