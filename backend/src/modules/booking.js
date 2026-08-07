// 订舱模块
const { Booking } = require('../models');
const { guard } = require('../middleware/auth');
const bookingController = require('../controllers/bookingController');

module.exports = {
  name: 'booking',
  title: '订舱管理',
  dependencies: ['order'],
  models: [Booking],
  routes(router, mw) {
    const g = (...args) => guard('booking', ...args);
    router.get('/bookings', g('read'), bookingController.list);
    router.get('/bookings/:id', g('read'), bookingController.get);
    router.post('/bookings', g('create'), bookingController.create);
    router.put('/bookings/:id', g('update'), bookingController.update);
    router.delete('/bookings/:id', g('delete'), bookingController.remove);
  },
  services: {},
  menu: { path: '/bookings', icon: 'Ship', permission: 'booking:read' },
  events: ['booking.created', 'booking.updated', 'booking.deleted', 'booking.shipped'],
};
