// 自动化模块
const { AlertRecord, AuditLog, CustomField, FlowNode, Group, Department, PrintTemplate, UserGroup, RolePermission } = require('../models');
const { guard } = require('../middleware/auth');
const alertController = require('../controllers/alertController');
const automationController = require('../controllers/automationController');
const systemController = require('../controllers/systemController');
const taskController = require('../controllers/taskController');
const portalController = require('../controllers/portalController');
const printTemplateController = require('../controllers/printTemplateController');
const roleController = require('../controllers/roleController');
const groupController = require('../controllers/groupController');
const customFieldController = require('../controllers/customFieldController');
const dashboardController = require('../controllers/dashboardController');

module.exports = {
  name: 'automation',
  title: '自动化与系统',
  dependencies: ['order', 'finance', 'customer'],
  models: [AlertRecord, AuditLog, CustomField, FlowNode, Group, Department, PrintTemplate, UserGroup, RolePermission],
  routes(router, mw) {
    const g = (...args) => guard('automation', ...args);
    // 预警
    router.get('/alerts', g('read'), alertController.list);
    router.post('/alerts/run', g('run'), alertController.run);
    router.post('/alerts/:id/resolve', g('update'), alertController.resolve);
    router.post('/alerts/:id/ignore', g('update'), alertController.ignore);
    // 自动化
    router.post('/automation/run', g('run'), automationController.run);
    // 待办工作台
    router.get('/tasks/todo', g('read'), taskController.todo);
    // 客户门户
    router.get('/portal/overview', g('read'), portalController.overview);
    router.get('/portal/orders', g('read'), portalController.myOrders);
    router.get('/portal/bills', g('read'), portalController.myBills);
    router.get('/portal/orders/:id', g('read'), portalController.orderDetail);
    // 系统管理
    router.get('/dashboard', g('read'), dashboardController.overview);
    router.get('/dashboard/order-status', g('read'), dashboardController.orderStatus);
    router.get('/dashboard/mode-dist', g('read'), dashboardController.modeDist);
    router.get('/dashboard/recent-orders', g('read'), dashboardController.recentOrders);
    router.get('/dashboard/metrics', g('read'), dashboardController.metrics);
    router.get('/dashboard/aging', g('read'), dashboardController.aging);
    router.get('/dashboard/sales-performance', g('read'), dashboardController.salesPerformance);
    // 打印模板
    router.get('/print-templates', g('read'), printTemplateController.list);
    router.get('/print-templates/:id', g('read'), printTemplateController.get);
    router.post('/print-templates', g('create'), printTemplateController.create);
    router.put('/print-templates/:id', g('update'), printTemplateController.update);
    router.delete('/print-templates/:id', g('delete'), printTemplateController.remove);
    router.get('/print-templates/fields/:docType', g('read'), printTemplateController.fields);
    router.post('/print-templates/:id/copy', g('create'), printTemplateController.copy);
    router.post('/print-templates/:id/default', g('update'), printTemplateController.setDefault);
    router.get('/print-templates/:id/preview', g('read'), printTemplateController.preview);
    router.get('/print/:docType/:bizId', g('read'), printTemplateController.print);
    // RBAC
    router.get('/roles', g('read'), roleController.list);
    router.get('/permissions', g('read'), roleController.permissions);
    router.get('/users', g('read'), roleController.listUsers);
    router.post('/roles', g('create'), roleController.create);
    router.put('/roles/:id', g('update'), roleController.update);
    router.delete('/roles/:id', g('delete'), roleController.remove);
    router.put('/roles/:id/permissions', g('update'), roleController.updatePermissions);
    router.post('/users', g('create'), roleController.createUser);
    router.put('/users/:id', g('update'), roleController.updateUser);
    router.delete('/users/:id', g('delete'), roleController.removeUser);
    router.put('/users/:id/roles', g('update'), roleController.updateUserRoles);
    router.get('/system/audit-logs', g('read'), systemController.auditLogs);
    // 小组
    router.get('/groups', g('read'), groupController.list);
    router.get('/groups/members', g('read'), groupController.members);
    router.get('/groups/:id', g('read'), groupController.get);
    router.post('/groups', g('create'), groupController.create);
    router.put('/groups/:id', g('update'), groupController.update);
    router.delete('/groups/:id', g('delete'), groupController.remove);
    router.post('/groups/:id/members', g('update'), groupController.addMember);
    router.delete('/groups/:id/members/:userId', g('update'), groupController.removeMember);
    // 自定义字段
    router.get('/custom-fields', g('read'), customFieldController.list);
    router.get('/custom-fields/:id', g('read'), customFieldController.get);
    router.post('/custom-fields', g('create'), customFieldController.create);
    router.put('/custom-fields/:id', g('update'), customFieldController.update);
    router.delete('/custom-fields/:id', g('delete'), customFieldController.remove);
  },
  services: {},
  menu: { path: '/system', icon: 'Setting', permission: 'automation:read' },
  events: ['alert.created', 'alert.resolved', 'automation.executed'],
};
