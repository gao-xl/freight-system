'use strict';

// document 模块 —— 路由收敛（架构 P1-1）：从 routes/index.js 迁出全部单证路由，
// 守卫/校验与迁移前等价（含全文检索、一键生成、上传/下载/预览、状态流转）。
const { guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const S = require('../../validation/schemas');
const documentController = require('../../controllers/documentController');

module.exports = {
  name: 'document',
  title: '单证管理',
  dependencies: ['order'],
  models: [],
  routes(router) {
    const g = (...args) => guard('document', ...args);
    // 静态路径须先于 /documents/:id
    router.get('/documents', g('read'), documentController.list);
    router.get('/documents/search', g('read'), documentController.searchContent); // 全文搜索
    router.get('/documents/generate', g('create'), documentController.generate); // 一键生成
    router.get('/documents/:id', g('read'), documentController.get);
    router.post('/documents/:id/status', g('update'), documentController.changeStatus); // 状态流转
    router.post('/documents', g('create'), validate(S.documentCreate), documentController.create);
    router.put('/documents/:id', g('update'), validate(S.documentUpdate), documentController.update);
    router.delete('/documents/:id', g('delete'), documentController.remove);
    router.post('/documents/:id/upload', g('update'), documentController.upload.single('file'), documentController.uploadFile);
    router.get('/documents/:id/download', g('read'), documentController.download);
    router.get('/documents/:id/file', g('read'), documentController.preview);
  },
  services: {},
  menu: { path: '/documents', icon: 'DocumentCopy', permission: 'document:read' },
  events: ['document.created', 'document.updated', 'document.deleted', 'document.generated'],
};