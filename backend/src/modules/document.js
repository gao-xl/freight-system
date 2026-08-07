// 单证模块
const { Document } = require('../models');
const { guard } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

module.exports = {
  name: 'document',
  title: '单证管理',
  dependencies: ['order'],
  models: [Document],
  routes(router, mw) {
    const g = (...args) => guard('document', ...args);
    router.get('/documents', g('read'), documentController.list);
    router.get('/documents/search', g('read'), documentController.searchContent);
    router.get('/documents/generate', g('create'), documentController.generate);
    router.get('/documents/:id', g('read'), documentController.get);
    router.post('/documents', g('create'), documentController.create);
    router.put('/documents/:id', g('update'), documentController.update);
    router.delete('/documents/:id', g('delete'), documentController.remove);
    router.post('/documents/:id/upload', g('update'), documentController.upload, documentController.uploadFile);
    router.get('/documents/:id/download', g('read'), documentController.download);
    router.get('/documents/:id/file', g('read'), documentController.preview);
    router.post('/documents/:id/status', g('update'), documentController.changeStatus);
  },
  services: {},
  menu: { path: '/documents', icon: 'DocumentCopy', permission: 'document:read' },
  events: ['document.created', 'document.updated', 'document.deleted', 'document.generated'],
};
