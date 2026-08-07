// 外部对接模块（增值）
const { IntegrationConfig, EdiMessage, ExchangeRate } = require('../models');
const { guard } = require('../middleware/auth');
const integrationController = require('../controllers/integrationController');
const externalController = require('../controllers/externalController');
const ediController = require('../controllers/ediController');
const portController = require('../controllers/portController');
const yardController = require('../controllers/yardController');
const qingdaoController = require('../controllers/qingdaoController');

module.exports = {
  name: 'integration',
  title: '外部对接',
  dependencies: ['order'],
  models: [IntegrationConfig, EdiMessage, ExchangeRate],
  routes(router, mw) {
    const g = (...args) => guard('integration', ...args);
    // 适配器管理
    router.get('/integrations', g('read'), integrationController.list);
    router.get('/integrations/registry', g('read'), integrationController.registry);
    router.get('/integrations/:id', g('read'), integrationController.get);
    router.post('/integrations', g('create'), integrationController.create);
    router.put('/integrations/:id', g('update'), integrationController.update);
    router.delete('/integrations/:id', g('delete'), integrationController.remove);
    router.post('/integrations/:id/trigger', g('update'), integrationController.trigger);
    // 外部查询
    router.get('/external/vessel/:mmsi', g('read'), externalController.vessel);
    router.get('/external/schedule', g('read'), externalController.schedule);
    router.get('/external/rate', g('read'), externalController.rate);
    router.get('/external/freight-rate', g('read'), externalController.freightRate);
    // EDI
    router.get('/edi/messages', g('read'), ediController.list);
    router.post('/edi/send-booking', g('create'), ediController.sendBooking);
    router.post('/edi/receive', g('create'), ediController.receive);
    // 港口
    router.get('/ports', g('read'), portController.list);
    router.get('/ports/query', g('read'), portController.query);
    router.post('/ports/report', g('create'), portController.report);
    // 青岛港
    router.get('/qingdao/nodes', g('read'), qingdaoController.nodes);
    router.post('/qingdao/nodes', g('create'), qingdaoController.createNode);
    router.get('/qingdao/checklist', g('read'), qingdaoController.checklist);
    router.get('/qingdao/alerts', g('read'), qingdaoController.alerts);
    router.get('/qingdao/manifest', g('read'), qingdaoController.manifest);
    router.post('/qingdao/check', g('update'), qingdaoController.check);
    // 场站
    router.get('/yards', g('read'), yardController.list);
    router.get('/yards/status', g('read'), yardController.status);
    router.get('/yards/records', g('read'), yardController.records);
    router.post('/yards/query', g('create'), yardController.query);
    router.post('/yards/records', g('create'), yardController.createRecord);
    router.get('/yards/:id', g('read'), yardController.get);
    router.post('/yards', g('create'), yardController.create);
    router.put('/yards/:id', g('update'), yardController.update);
    router.delete('/yards/:id', g('delete'), yardController.remove);
  },
  services: {},
  menu: { path: '/integrations', icon: 'Connection', permission: 'integration:read' },
  events: [],
};
