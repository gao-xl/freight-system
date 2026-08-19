'use strict';

// booking 模块 —— 路由收敛（架构 P1-1）：从 routes/index.js 迁出全部订舱路由，
// 与迁移前守卫/校验等价（含 validate、回收站、复制）。
const { guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const S = require('../../validation/schemas');
const bookingController = require('../../controllers/bookingController');

module.exports = {
  name: 'booking',
  title: '订舱管理',
  dependencies: ['order'],
  models: [],
  routes(router) {
    const g = (...args) => guard('booking', ...args);
    router.get('/bookings', g('read'), bookingController.list);
    router.get('/bookings/:id', g('read'), bookingController.get);
    router.post('/bookings', g('create'), validate(S.bookingCreate), bookingController.create);
    router.put('/bookings/:id', g('update'), validate(S.bookingUpdate), bookingController.update);
    router.post('/bookings/:id/restore', g('update'), bookingController.restore); // U5 回收站恢复
    router.post('/bookings/:id/copy', g('create'), bookingController.copy); // P0-3 订舱复制
    router.delete('/bookings/:id', g('delete'), bookingController.remove);
  },
  services: {},
  menu: { path: '/bookings', icon: 'Ship', permission: 'booking:read' },
  events: ['booking.created', 'booking.updated', 'booking.deleted', 'booking.shipped'],
};