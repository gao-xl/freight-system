'use strict';

// supplier 模块 —— 路由收敛（架构 P1-1）：
// 从 routes/index.js 迁出全部供应商路由，改由 ModuleRegistry 自动挂载。
// 路由与守卫与迁移前完全等价（含 validate / 上传 / 回收站），消除"双轨制"。
const { guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { uploadMemory } = require('../../middleware/upload');
const S = require('../../validation/schemas');
const supplierController = require('../../controllers/supplierController');

module.exports = {
  name: 'supplier',
  title: '供应商管理',
  dependencies: [],
  models: [],
  routes(router) {
    const g = (...args) => guard('supplier', ...args);
    router.get('/suppliers', g('read'), supplierController.list);
    router.get('/suppliers/import-template', g('read'), supplierController.importTemplate);
    router.post('/suppliers/import', g('create'), uploadMemory.single('file'), supplierController.importExcel);
    router.post('/suppliers/batch-delete', g('delete'), supplierController.batchRemove);
    router.post('/suppliers/batch-update', g('update'), supplierController.batchUpdate);
    router.post('/suppliers/:id/restore', g('update'), supplierController.restore); // U5 回收站恢复
    router.get('/suppliers/:id', g('read'), supplierController.get);
    router.post('/suppliers', g('create'), validate(S.supplierCreate), supplierController.create);
    router.put('/suppliers/:id', g('update'), validate(S.supplierUpdate), supplierController.update);
    router.delete('/suppliers/:id', g('delete'), supplierController.remove);
  },
  services: {},
  menu: { path: '/suppliers', icon: 'OfficeBuilding', permission: 'supplier:read' },
  events: ['supplier.created', 'supplier.updated', 'supplier.deleted'],
};