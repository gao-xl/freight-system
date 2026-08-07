// 认证模块 —— {name, title, models, routes, services, seed, menu, events}
const { Router } = require('express');
const { User, Role, Permission, UserRole, RolePermission } = require('../models');
const { authRequired, requirePermission, guard } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { login, me, changePassword } = require('../controllers/authController');

module.exports = {
  name: 'auth',
  title: '认证与权限',
  models: [User, Role, Permission, UserRole, RolePermission],
  routes(router, mw) {
    router.post('/auth/login', login);
    router.get('/auth/me', authRequired, me);
    router.post('/auth/change-password', authRequired, changePassword);
  },
  services: {},
  menu: null,
  events: ['user.login'],
};
