'use strict';

// customer 模块 —— 路由收敛（架构 P1-1）：
// 从 routes/index.js 迁出完整客户域路由（CRUD / 联系人 / 跟进 / 附件 / 回收站 / 导入），
// 守卫与校验与迁移前完全等价。
const { guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { uploadMemory } = require('../../middleware/upload');
const S = require('../../validation/schemas');
const customerController = require('../../controllers/customerController');
const customerAttachment = require('../../controllers/customerAttachmentController');

module.exports = {
  name: 'customer',
  title: '客户管理',
  dependencies: [],
  models: [],
  routes(router) {
    const g = (...args) => guard('customer', ...args);
    // 静态路径须先于 /customers/:id 注册，避免被 :id 捕获
    router.get('/customers', g('read'), customerController.list);
    router.get('/customers/stats', g('read'), customerController.stats);
    router.get('/customers/pending-follows', g('read'), customerController.pendingFollows);
    router.get('/customers/import-template', g('read'), customerController.importTemplate);
    router.post('/customers/import', g('create'), uploadMemory.single('file'), customerController.importExcel);
    router.post('/customers/batch-delete', g('delete'), customerController.batchRemove);
    router.post('/customers/batch-update', g('update'), customerController.batchUpdate);
    router.post('/customers/:id/restore', g('update'), customerController.restore); // U5 回收站恢复
    router.get('/customers/:id', g('read'), customerController.get);
    router.get('/customers/:id/overview', g('read'), customerController.overview); // N4 客户360°
    // P1 多联系人
    router.get('/customers/:id/contacts', g('read'), customerController.listContacts);
    router.post('/customers/:id/contacts', g('update'), customerController.createContact);
    router.put('/customers/contacts/:contactId', g('update'), customerController.updateContact);
    router.delete('/customers/contacts/:contactId', g('delete'), customerController.removeContact);
    // P1 客户附件
    router.get('/customers/:id/attachments', g('read'), customerAttachment.list);
    router.post('/customers/:id/attachments', g('update'), customerAttachment.upload.single('file'), customerAttachment.create);
    router.get('/customers/attachments/:id/download', g('read'), customerAttachment.download);
    router.delete('/customers/attachments/:id', g('delete'), customerAttachment.remove);
    // 跟进记录
    router.get('/customers/:id/follows', g('read'), customerController.listFollows);
    router.post('/customers/:id/follows', g('update'), validate(S.followCreate), customerController.createFollow);
    router.put('/customers/follows/:followId', g('update'), validate(S.followUpdate), customerController.updateFollow);
    router.delete('/customers/follows/:followId', g('delete'), customerController.removeFollow);
    router.post('/customers', g('create'), validate(S.customerCreate), customerController.create);
    router.put('/customers/:id', g('update'), validate(S.customerUpdate), customerController.update);
    router.delete('/customers/:id', g('delete'), customerController.remove);
  },
  services: {},
  menu: { path: '/customers', icon: 'User', permission: 'customer:read' },
  events: ['customer.created', 'customer.updated', 'customer.deleted', 'customer.followed'],
};