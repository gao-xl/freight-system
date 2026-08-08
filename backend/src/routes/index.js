const express = require('express');
const multer = require('multer');
const { authRequired, requirePermission, requireRole, guard } = require('../middleware/auth');
const { dataScope } = require('../middleware/dataScope');
const { validate } = require('../middleware/validate');
const S = require('../validation/schemas');
const auth = require('../controllers/authController');
const customer = require('../controllers/customerController');
const supplier = require('../controllers/supplierController');
const order = require('../controllers/orderController');
const booking = require('../controllers/bookingController');
const customs = require('../controllers/customsController');
const document = require('../controllers/documentController');
const track = require('../controllers/trackController');
const finance = require('../controllers/financeController');
const financeStatement = require('../controllers/financeStatementController');
const integration = require('../controllers/integrationController');
const dashboard = require('../controllers/dashboardController');
const quotation = require('../controllers/quotationController');
const role = require('../controllers/roleController');
const system = require('../controllers/systemController');
const qingdao = require('../controllers/qingdaoController');
const alert = require('../controllers/alertController');
const yard = require('../controllers/yardController');
const external = require('../controllers/externalController');
const print = require('../controllers/printTemplateController');
const release = require('../controllers/releaseController');
const task = require('../controllers/taskController');
const group = require('../controllers/groupController');
const flow = require('../controllers/flowController');
const customField = require('../controllers/customFieldController');
const container = require('../controllers/containerController');
const portal = require('../controllers/portalController');
const port = require('../controllers/portController');
const edi = require('../controllers/ediController');
const payment = require('../controllers/paymentController');
const company = require('../controllers/companyController');
const automation = require('../controllers/automationController');
const importCtrl = require('../controllers/importController');
const freightRate = require('../controllers/freightRateController');
const businessRule = require('../controllers/businessRuleController');
const workflow = require('../controllers/workflowController');
const report = require('../controllers/reportController');

const router = express.Router();

// 批量导入用内存存储（xlsx 直接读 buffer）
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 自动化（仅管理员可手动触发；定时任务由 alertScheduler 自动执行）
router.post('/automation/run', guard('system', '*'), automation.run);

// 认证（公开）
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [认证]
 *     summary: 用户登录
 *     description: |
 *       校验用户名密码，返回 JWT 与权限点清单。
 *       密码错误与用户不存在返回同一文案，且服务端做恒定时间比较，避免通过响应时间枚举用户名。
 *       该端点独立限流（默认 15 分钟内 20 次），超限返回 429。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/LoginData'
 *       400:
 *         description: 用户名或密码为空
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 用户名或密码错误，或账号已禁用
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: 登录请求过于频繁
 */
router.post('/auth/login', validate(S.login), auth.login);
router.get('/auth/me', authRequired, auth.me);
router.post('/auth/change-password', authRequired, validate(S.changePassword), auth.changePassword);

// 数据隔离：所有业务路由统一注入 req.dataScope（范围：all/group/self）
// 控制器通过 scopedWhere/scopedFindOne 等辅助函数消费该范围，实现行级数据隔离
router.use(authRequired, dataScope);

// RBAC 系统管理（admin）
router.get('/roles', authRequired, requirePermission('system', 'role'), role.list);
router.post('/roles', authRequired, requirePermission('system', 'role'), validate(S.roleCreate), role.create);
router.put('/roles/:id', authRequired, requirePermission('system', 'role'), role.update);
router.delete('/roles/:id', authRequired, requirePermission('system', 'role'), role.remove);
router.put('/roles/:id/permissions', authRequired, requirePermission('system', 'role'), validate(S.assignPermissions), role.assignPermissions);
router.get('/permissions', authRequired, requirePermission('system', 'role'), system.permissionList);
router.get('/users', authRequired, requirePermission('system', 'user'), system.userList);
router.post('/users', authRequired, requirePermission('system', 'user'), validate(S.userCreate), system.createUser);
router.put('/users/:id', authRequired, requirePermission('system', 'user'), validate(S.userUpdate), system.updateUser);
router.delete('/users/:id', authRequired, requirePermission('system', 'user'), system.removeUser);
router.put('/users/:id/roles', authRequired, requirePermission('system', 'user'), validate(S.assignRoles), system.assignRoles);
router.get('/system/audit-logs', authRequired, requirePermission('system', 'audit'), system.auditLogs);

// 接口密钥（脚本/第三方系统认证），路由细节见 src/routes/apiKey.js
router.use('/api-keys', require('./apiKey'));

// B2 小组管理（数据权限）
router.get('/groups', authRequired, requirePermission('system', 'group'), group.list);
router.get('/groups/members', authRequired, requirePermission('system', 'group'), group.members);
router.get('/groups/:id', authRequired, requirePermission('system', 'group'), group.get);
router.post('/groups', authRequired, requirePermission('system', 'group'), group.create);
router.put('/groups/:id', authRequired, requirePermission('system', 'group'), group.update);
router.delete('/groups/:id', authRequired, requirePermission('system', 'group'), group.remove);
router.post('/groups/:id/members', authRequired, requirePermission('system', 'group'), group.addMember);
router.delete('/groups/:id/members/:userId', authRequired, requirePermission('system', 'group'), group.removeMember);

// 公司设置（公司信息/部门/银行账号/开票抬头）
router.get('/company/profile', authRequired, requirePermission('system', 'company'), company.getProfile);
router.put('/company/profile', authRequired, requirePermission('system', 'company'), company.saveProfile);
router.get('/departments', authRequired, requirePermission('system', 'company'), company.listDepartments);
router.post('/departments', authRequired, requirePermission('system', 'company'), company.createDepartment);
router.put('/departments/:id', authRequired, requirePermission('system', 'company'), company.updateDepartment);
router.delete('/departments/:id', authRequired, requirePermission('system', 'company'), company.removeDepartment);
router.get('/company-accounts', authRequired, requirePermission('system', 'company'), company.listAccounts);
router.post('/company-accounts', authRequired, requirePermission('system', 'company'), company.createAccount);
router.put('/company-accounts/:id', authRequired, requirePermission('system', 'company'), company.updateAccount);
router.delete('/company-accounts/:id', authRequired, requirePermission('system', 'company'), company.removeAccount);
router.get('/invoice-titles', authRequired, requirePermission('system', 'company'), company.listTitles);
router.post('/invoice-titles', authRequired, requirePermission('system', 'company'), company.createTitle);
router.put('/invoice-titles/:id', authRequired, requirePermission('system', 'company'), company.updateTitle);
router.delete('/invoice-titles/:id', authRequired, requirePermission('system', 'company'), company.removeTitle);

// B3 进出口流程节点
router.get('/flow-nodes', guard('order', 'read'), flow.listFlowNodes);
router.put('/flow-nodes/:id', guard('order', 'update'), flow.updateFlowNode);
router.get('/flow-stats', guard('dashboard', 'read'), flow.flowStats);
router.get('/orders/:id/nodes', guard('order', 'read'), flow.orderNodes);
router.put('/orders/:id/nodes/:nodeCode', guard('order', 'update'), flow.updateOrderNode);

// B4 自定义字段（二开扩展）
router.get('/custom-fields', authRequired, customField.list);
router.post('/custom-fields', authRequired, requirePermission('system', 'custom'), customField.create);
router.put('/custom-fields/:id', authRequired, requirePermission('system', 'custom'), customField.update);
router.delete('/custom-fields/:id', authRequired, requirePermission('system', 'custom'), customField.remove);

// B4 自定义字段值读写（按业务实体）
const cf = customField.customFieldValues;
const { Customer, Order, Booking, FinanceRecord } = require('../models');
const cfOrder = cf('order', Order);
const cfCustomer = cf('customer', Customer);
const cfBooking = cf('booking', Booking);
const cfFinance = cf('finance', FinanceRecord);
router.get('/orders/:id/custom-fields', authRequired, cfOrder.getValues);
router.put('/orders/:id/custom-fields', authRequired, cfOrder.updateValues);
router.get('/customers/:id/custom-fields', authRequired, cfCustomer.getValues);
router.put('/customers/:id/custom-fields', authRequired, cfCustomer.updateValues);
router.get('/bookings/:id/custom-fields', authRequired, cfBooking.getValues);
router.put('/bookings/:id/custom-fields', authRequired, cfBooking.updateValues);
router.get('/finance/:id/custom-fields', authRequired, cfFinance.getValues);
router.put('/finance/:id/custom-fields', authRequired, cfFinance.updateValues);

// 看板
router.get('/dashboard', guard('dashboard', 'read'), dashboard.dashboard);
router.get('/dashboard/order-status', guard('dashboard', 'read'), dashboard.orderStatusDist);
router.get('/dashboard/mode-dist', guard('dashboard', 'read'), dashboard.modeDist);
router.get('/dashboard/recent-orders', guard('dashboard', 'read'), dashboard.recentOrders);
router.get('/dashboard/metrics', guard('dashboard', 'read'), dashboard.metrics);
router.get('/dashboard/aging', guard('dashboard', 'read'), dashboard.aging);
router.get('/dashboard/sales-performance', guard('dashboard', 'read'), dashboard.salesPerformance);

// P2.3 Excel 批量导入（客户/供应商/订单）
// 模板下载用对应模块 read 权限，导入写入用 create 权限；复用上方 uploadMemory（内存 10MB）
router.get('/import/templates/:biz', authRequired, importCtrl.importGuard('read'), importCtrl.template);
router.post('/import/:biz', authRequired, importCtrl.importGuard('create'), uploadMemory.single('file'), importCtrl.importFile);

// 客户
router.get('/customers', guard('customer', 'read'), customer.list);
router.get('/customers/stats', guard('customer', 'read'), customer.stats);
router.get('/customers/pending-follows', guard('customer', 'read'), customer.pendingFollows);
router.get('/customers/import-template', guard('customer', 'read'), customer.importTemplate);
router.post('/customers/import', guard('customer', 'create'), uploadMemory.single('file'), customer.importExcel);
router.post('/customers/batch-delete', guard('customer', 'delete'), customer.batchRemove);
router.post('/customers/batch-update', guard('customer', 'update'), customer.batchUpdate);
router.get('/customers/:id', guard('customer', 'read'), customer.get);
router.get('/customers/:id/follows', guard('customer', 'read'), customer.listFollows);
router.post('/customers/:id/follows', guard('customer', 'update'), validate(S.followCreate), customer.createFollow);
router.put('/customers/follows/:followId', guard('customer', 'update'), validate(S.followUpdate), customer.updateFollow);
router.delete('/customers/follows/:followId', guard('customer', 'delete'), customer.removeFollow);
router.post('/customers', guard('customer', 'create'), validate(S.customerCreate), customer.create);
router.put('/customers/:id', guard('customer', 'update'), validate(S.customerUpdate), customer.update);
router.delete('/customers/:id', guard('customer', 'delete'), customer.remove);

// 供应商
router.get('/suppliers', guard('supplier', 'read'), supplier.list);
router.get('/suppliers/import-template', guard('supplier', 'read'), supplier.importTemplate);
router.post('/suppliers/import', guard('supplier', 'create'), uploadMemory.single('file'), supplier.importExcel);
router.post('/suppliers/batch-delete', guard('supplier', 'delete'), supplier.batchRemove);
router.post('/suppliers/batch-update', guard('supplier', 'update'), supplier.batchUpdate);
router.get('/suppliers/:id', guard('supplier', 'read'), supplier.get);
router.post('/suppliers', guard('supplier', 'create'), validate(S.supplierCreate), supplier.create);
router.put('/suppliers/:id', guard('supplier', 'update'), validate(S.supplierUpdate), supplier.update);
router.delete('/suppliers/:id', guard('supplier', 'delete'), supplier.remove);

// 订单
router.get('/orders', guard('order', 'read'), order.list);
router.get('/orders/export', guard('order', 'read'), order.exportExcel);
router.get('/orders/profit-summary', guard('finance', 'read'), order.profitSummary);
router.post('/orders/batch-delete', guard('order', 'delete'), order.batchRemove);
router.post('/orders/batch-update', guard('order', 'update'), order.batchUpdate);
router.post('/orders/batch-advance', guard('order', 'update'), order.batchAdvance);
router.post('/orders/batch-status', guard('order', 'update'), order.batchStatus);
router.get('/orders/:id/detail', guard('order', 'read'), order.detail);
router.get('/orders/:id/timeline', guard('order', 'read'), order.timeline);
router.get('/orders/:id/flow', guard('order', 'read'), order.flow);       // A6 业务节点流转
router.post('/orders/:id/advance', guard('order', 'update'), order.advance); // A6 手动推进节点
router.get('/orders/:id/profit', guard('finance', 'read'), order.profit);
router.get('/orders/:id', guard('order', 'read'), order.get);
router.post('/orders', guard('order', 'create'), validate(S.orderCreate), order.create);
router.put('/orders/:id', guard('order', 'update'), validate(S.orderUpdate), order.update);
router.delete('/orders/:id', guard('order', 'delete'), order.remove);

// C6 一单多箱
router.get('/orders/:orderId/containers', guard('order', 'read'), container.listByOrder);
router.put('/orders/:orderId/containers', guard('order', 'update'), container.saveByOrder);
router.get('/containers', guard('order', 'read'), container.list);
router.get('/containers/:id', guard('order', 'read'), container.get);
router.delete('/containers/:id', guard('order', 'delete'), container.remove);

// 放单控制（B8）
router.get('/release', guard('release', 'read'), release.list);
router.get('/release/orders/:id', guard('release', 'read'), release.records);
router.post('/orders/:id/release', guard('release', 'create'), release.apply);
router.post('/release/:id/approve', guard('release', 'approve'), release.approve);

// 待办任务中心（A4）——聚合各业务模块，登录用户即可访问
router.get('/tasks/todo', authRequired, task.todo);

// 订舱
router.get('/bookings', guard('booking', 'read'), booking.list);
router.get('/bookings/:id', guard('booking', 'read'), booking.get);
router.post('/bookings', guard('booking', 'create'), validate(S.bookingCreate), booking.create);
router.put('/bookings/:id', guard('booking', 'update'), validate(S.bookingUpdate), booking.update);
router.delete('/bookings/:id', guard('booking', 'delete'), booking.remove);

// 报关
router.get('/customs', guard('customs', 'read'), customs.list);
router.get('/customs/:id', guard('customs', 'read'), customs.get);
router.post('/customs', guard('customs', 'create'), validate(S.customsCreate), customs.create);
router.put('/customs/:id', guard('customs', 'update'), validate(S.customsUpdate), customs.update);
router.delete('/customs/:id', guard('customs', 'delete'), customs.remove);

// 单证
router.get('/documents', guard('document', 'read'), document.list);
router.get('/documents/search', guard('document', 'read'), document.searchContent); // 全文搜索
router.get('/documents/generate', guard('document', 'create'), document.generate); // 一键生成（须在 :id 之前）
router.get('/documents/:id', guard('document', 'read'), document.get);
router.post('/documents/:id/status', guard('document', 'update'), document.changeStatus); // 状态流转
router.post('/documents', guard('document', 'create'), validate(S.documentCreate), document.create);
router.put('/documents/:id', guard('document', 'update'), validate(S.documentUpdate), document.update);
router.delete('/documents/:id', guard('document', 'delete'), document.remove);
router.post('/documents/:id/upload', guard('document', 'update'), document.upload.single('file'), document.uploadFile);
router.get('/documents/:id/download', guard('document', 'read'), document.download);
router.get('/documents/:id/file', guard('document', 'read'), document.preview);

// 运输跟踪
router.get('/tracks', guard('track', 'read'), track.list);
router.get('/tracks/:id', guard('track', 'read'), track.get);
router.post('/tracks', guard('track', 'create'), track.create);
router.put('/tracks/:id', guard('track', 'update'), track.update);
router.delete('/tracks/:id', guard('track', 'delete'), track.remove);

// 财务
router.get('/finance', guard('finance', 'read'), finance.list);
router.get('/finance/export', guard('finance', 'read'), finance.exportExcel);
router.get('/finance/summary', guard('finance', 'read'), finance.summary);
router.get('/finance/currency-summary', guard('finance', 'read'), finance.currencySummary); // B6 多币种汇总
router.get('/finance/customers/:customerId/credit', guard('finance', 'read'), finance.creditCheck); // B6 信用额度
router.get('/finance/monthly-trend', guard('finance', 'read'), finance.monthlyTrend);
router.get('/finance/reconcile', guard('finance', 'read'), finance.reconcile);
router.get('/finance/statement', guard('finance', 'read'), financeStatement.statement); // P2.4 对账单
// 结账/扎帐/锁帐（须在 /finance/:id 之前注册，避免 periods 被 :id 捕获）
router.get('/finance/periods', guard('finance', 'read'), finance.periods);
router.post('/finance/periods/ensure', guard('finance', 'read'), finance.ensurePeriods);
router.get('/finance/periods/:code/statement', guard('finance', 'read'), finance.periodStatement);
router.post('/finance/periods/:code/close', guard('finance', 'close'), finance.closePeriod);
router.post('/finance/periods/:code/lock', guard('finance', 'lock'), finance.lockPeriod);
router.post('/finance/periods/:code/unlock', guard('finance', 'unlock'), finance.unlockPeriod);
router.get('/finance/invoices', guard('finance', 'read'), finance.invoiceList);
router.post('/finance/invoices', guard('finance', 'create'), finance.createInvoice);
router.post('/finance/invoices/:id/issue', guard('finance', 'update'), finance.issueInvoice);
router.post('/finance/invoices/:id/cancel', guard('finance', 'update'), finance.cancelInvoice);
router.post('/finance/batch-delete', guard('finance', 'delete'), finance.batchRemove);
router.post('/finance/batch-update', guard('finance', 'update'), finance.batchUpdate);
router.post('/finance/batch-writeoff', guard('finance', 'update'), finance.batchWriteoff);
router.post('/finance/:id/writeoff', guard('finance', 'update'), finance.writeoff);
router.get('/finance/:id', guard('finance', 'read'), finance.get);
router.post('/finance', guard('finance', 'create'), validate(S.financeCreate), finance.create);
router.put('/finance/:id', guard('finance', 'update'), validate(S.financeUpdate), finance.update);
router.delete('/finance/:id', guard('finance', 'delete'), finance.remove);

// 外部系统对接
router.get('/integrations', guard('integration', 'read'), integration.list);
router.get('/integrations/registry', guard('integration', 'read'), integration.registry);
router.get('/integrations/:id', guard('integration', 'read'), integration.get);
router.post('/integrations', guard('integration', 'update'), integration.create);
router.put('/integrations/:id', guard('integration', 'update'), integration.update);
router.delete('/integrations/:id', guard('integration', 'update'), integration.remove);
router.post('/integrations/trigger', guard('integration', 'trigger'), integration.trigger);

// 报价/询价
router.get('/quotations', authRequired, requirePermission('quotation', 'read'), quotation.list);
router.get('/quotations/stats', authRequired, requirePermission('quotation', 'read'), quotation.stats);
router.get('/quotations/:id', authRequired, requirePermission('quotation', 'read'), quotation.get);
router.post('/quotations', authRequired, requirePermission('quotation', 'create'), quotation.create);
router.put('/quotations/:id', authRequired, requirePermission('quotation', 'update'), quotation.update);
router.delete('/quotations/:id', authRequired, requirePermission('quotation', 'delete'), quotation.remove);
router.post('/quotations/:id/send', authRequired, requirePermission('quotation', 'update'), quotation.send);
router.post('/quotations/:id/confirm', authRequired, requirePermission('quotation', 'update'), quotation.confirm);
router.post('/quotations/:id/convert-order', authRequired, requirePermission('quotation', 'convert'), quotation.convertOrder);

// P2.7 本地运价小库（服务报价；权限沿用 quotation 模块）
router.get('/freight-rates/search', guard('quotation', 'read'), freightRate.search); // 检索需在 :id 之前
router.get('/freight-rates', guard('quotation', 'read'), freightRate.list);
router.get('/freight-rates/:id', guard('quotation', 'read'), freightRate.get);
router.post('/freight-rates/batch-delete', guard('quotation', 'delete'), freightRate.batchRemove);
router.post('/freight-rates/batch-update', guard('quotation', 'update'), freightRate.batchUpdate);
router.post('/freight-rates', guard('quotation', 'create'), validate(S.freightRateCreate), freightRate.create);
router.put('/freight-rates/:id', guard('quotation', 'update'), validate(S.freightRateUpdate), freightRate.update);
router.delete('/freight-rates/:id', guard('quotation', 'delete'), freightRate.remove);

// 青岛港专项
router.get('/qingdao/nodes', guard('qingdao', 'read'), qingdao.nodes);
router.post('/qingdao/nodes', guard('qingdao', 'update'), qingdao.updateNode);
router.get('/qingdao/checklist', guard('qingdao', 'read'), qingdao.checklist);
router.get('/qingdao/alerts', guard('qingdao', 'read'), qingdao.alerts);
router.get('/qingdao/manifest/check', guard('qingdao', 'read'), qingdao.manifestCheck);

// 预警中心
router.get('/alerts', guard('alert', 'read'), alert.list);
router.post('/alerts/run', guard('alert', 'read'), alert.run);
router.post('/alerts/:id/resolve', guard('alert', 'update'), alert.handle);
router.post('/alerts/:id/ignore', guard('alert', 'update'), alert.handle);

// P3.1 业务规则引擎（DB 化）
router.get('/business-rules', guard('alert', 'read'), businessRule.list);
router.get('/business-rules/meta', guard('alert', 'read'), businessRule.meta);
router.post('/business-rules', guard('alert', 'update'), businessRule.create);
router.put('/business-rules/:id', guard('alert', 'update'), businessRule.update);
router.delete('/business-rules/:id', guard('alert', 'update'), businessRule.remove);
router.post('/business-rules/:id/test', guard('alert', 'update'), businessRule.test);

// P3.2 流程状态机配置化
router.get('/workflow/status-options', guard('alert', 'read'), workflow.statusOptions);
router.get('/workflow/configs', guard('alert', 'read'), workflow.list);
router.post('/workflow/configs', guard('alert', 'update'), workflow.create);
router.put('/workflow/configs/:id', guard('alert', 'update'), workflow.update);
router.delete('/workflow/configs/:id', guard('alert', 'update'), workflow.remove);
router.post('/workflow/transition', guard('order', 'update'), workflow.doTransition);

// P3.3 自定义报表
router.get('/reports/meta', guard('dashboard', 'read'), report.meta);
router.get('/reports', guard('dashboard', 'read'), report.list);
router.post('/reports', guard('dashboard', 'update'), report.create);
router.put('/reports/:id', guard('dashboard', 'update'), report.update);
router.delete('/reports/:id', guard('dashboard', 'update'), report.remove);
router.post('/reports/:id/run', guard('dashboard', 'read'), report.run);

// 免费第三方外部API
router.get('/external/vessel/:mmsi', guard('track', 'read'), external.vessel);
router.get('/external/schedule', guard('track', 'read'), external.schedule);
router.get('/external/rate', guard('finance', 'read'), external.rate);
router.get('/external/freight-rate', guard('order', 'read'), external.freightRate); // C4 运价

// C1 港口官方平台
router.get('/ports', guard('track', 'read'), port.ports);
router.get('/ports/query', guard('track', 'read'), port.query);
router.post('/ports/query', guard('track', 'read'), port.query);
router.post('/ports/report', guard('track', 'update'), port.report);

// C2 EDI 报文
router.get('/edi/messages', guard('order', 'read'), edi.list);
router.post('/edi/send-booking', guard('order', 'update'), edi.sendBooking);
router.post('/edi/receive', guard('order', 'update'), edi.receive);

// C3 美元支付
router.get('/payments', guard('finance', 'read'), payment.list);
router.post('/payments', guard('finance', 'create'), payment.create);
router.post('/payments/:id/submit', guard('finance', 'update'), payment.submit);
router.get('/payments/:id', guard('finance', 'read'), payment.status);

// 场站信息查询
router.get('/yards', guard('yard', 'read'), yard.yards);
router.get('/yards/status', guard('yard', 'read'), yard.status);
router.get('/yards/records', guard('yard', 'read'), yard.records);
router.post('/yards/query', guard('yard', 'update'), yard.query);
router.post('/yards/records', guard('yard', 'update'), yard.manualCreate);
router.post('/yards', guard('yard', 'update'), yard.create);         // 新增场站名录
router.get('/yards/:id', guard('yard', 'read'), yard.get);
router.put('/yards/:id', guard('yard', 'update'), yard.update);       // 人工录入/修正/名录编辑
router.delete('/yards/:id', guard('yard', 'update'), yard.remove);

// 打印模板
router.get('/print-templates', guard('print', 'read'), print.list);
router.get('/print-templates/fields/:docType', guard('print', 'read'), print.fields);
router.post('/print-templates', guard('print', 'write'), print.create);
router.post('/print-templates/:id/copy', guard('print', 'write'), print.copy);
router.put('/print-templates/:id/default', guard('print', 'write'), print.setDefault);
router.post('/print-templates/:id/preview', guard('print', 'read'), print.preview);
router.get('/print-templates/:id', guard('print', 'read'), print.get);
router.put('/print-templates/:id', guard('print', 'write'), print.update);
router.delete('/print-templates/:id', guard('print', 'write'), print.remove);
// 打印渲染（PDF/HTML）
router.get('/print/:docType/:bizId', guard('print', 'read'), print.print);

// C5 客户自助门户（只读，customer 角色）
router.get('/portal/overview', authRequired, requireRole('customer', 'admin', 'manager', 'operator', 'finance', 'viewer'), portal.overview);
router.get('/portal/orders', authRequired, requireRole('customer', 'admin', 'manager', 'operator', 'finance', 'viewer'), portal.myOrders);
router.get('/portal/bills', authRequired, requireRole('customer', 'admin', 'manager', 'operator', 'finance', 'viewer'), portal.myBills);
router.get('/portal/orders/:id', authRequired, requireRole('customer', 'admin', 'manager', 'operator', 'finance', 'viewer'), portal.orderDetail);

module.exports = router;