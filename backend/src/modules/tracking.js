// 运输跟踪模块
const { ShipmentTrack } = require('../models');
const { guard } = require('../middleware/auth');
const trackController = require('../controllers/trackController');

module.exports = {
  name: 'tracking',
  title: '运输跟踪',
  dependencies: ['order'],
  models: [ShipmentTrack],
  routes(router, mw) {
    const g = (...args) => guard('tracking', ...args);
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
