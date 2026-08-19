'use strict';

// quotation 模块 —— 路由收敛（架构 P1-1）：从 routes/index.js 迁出报价域全部路由
// （报价 / 报价模板 / 运价），守卫风格与迁移前保持一致：
// 报价与模板沿用 authRequired+requirePermission，运价沿用 guard('quotation')。
const { authRequired, requirePermission, guard } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const S = require('../../validation/schemas');
const quotationController = require('../../controllers/quotationController');
const quotationTemplate = require('../../controllers/quotationTemplateController');
const freightRate = require('../../controllers/freightRateController');

module.exports = {
  name: 'quotation',
  title: '报价管理',
  dependencies: ['customer'],
  models: [],
  routes(router) {
    // 报价
    router.get('/quotations', authRequired, requirePermission('quotation', 'read'), quotationController.list);
    router.get('/quotations/stats', authRequired, requirePermission('quotation', 'read'), quotationController.stats);
    router.get('/quotations/:id', authRequired, requirePermission('quotation', 'read'), quotationController.get);
    router.post('/quotations', authRequired, requirePermission('quotation', 'create'), quotationController.create);
    router.put('/quotations/:id', authRequired, requirePermission('quotation', 'update'), quotationController.update);
    router.delete('/quotations/:id', authRequired, requirePermission('quotation', 'delete'), quotationController.remove);
    router.post('/quotations/:id/send', authRequired, requirePermission('quotation', 'update'), quotationController.send);
    router.post('/quotations/:id/confirm', authRequired, requirePermission('quotation', 'update'), quotationController.confirm);
    router.post('/quotations/:id/convert-order', authRequired, requirePermission('quotation', 'convert'), quotationController.convertOrder);
    // 报价模板（P1-1）：/match 须在 /:id 之前
    router.get('/quotation-templates', authRequired, requirePermission('quotation', 'read'), quotationTemplate.list);
    router.get('/quotation-templates/match', authRequired, requirePermission('quotation', 'read'), quotationTemplate.match);
    router.get('/quotation-templates/:id', authRequired, requirePermission('quotation', 'read'), quotationTemplate.get);
    router.post('/quotation-templates', authRequired, requirePermission('quotation', 'create'), quotationTemplate.create);
    router.put('/quotation-templates/:id', authRequired, requirePermission('quotation', 'update'), quotationTemplate.update);
    router.delete('/quotation-templates/:id', authRequired, requirePermission('quotation', 'delete'), quotationTemplate.remove);
    // 运价（权限点仍为 quotation）：检索/比价/推荐须在 /:id 之前
    const g = (...args) => guard('quotation', ...args);
    router.get('/freight-rates/search', g('read'), freightRate.search);
    router.get('/freight-rates/compare', g('read'), freightRate.compare); // P1 运价比价
    router.get('/freight-rates/recommend', g('read'), freightRate.recommend); // P2 智能推荐
    router.get('/freight-rates', g('read'), freightRate.list);
    router.get('/freight-rates/:id', g('read'), freightRate.get);
    router.post('/freight-rates/batch-delete', g('delete'), freightRate.batchRemove);
    router.post('/freight-rates/batch-update', g('update'), freightRate.batchUpdate);
    router.post('/freight-rates/:id/restore', g('update'), freightRate.restore); // U5 回收站恢复
    router.post('/freight-rates', g('create'), validate(S.freightRateCreate), freightRate.create);
    router.put('/freight-rates/:id', g('update'), validate(S.freightRateUpdate), freightRate.update);
    router.delete('/freight-rates/:id', g('delete'), freightRate.remove);
  },
  services: {},
  menu: { path: '/quotations', icon: 'PriceTag', permission: 'quotation:read' },
  events: ['quotation.created', 'quotation.updated', 'quotation.deleted', 'quotation.confirmed', 'quotation.converted'],
};