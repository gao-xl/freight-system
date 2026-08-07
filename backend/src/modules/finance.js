// 财务模块
const { FinanceRecord, Invoice, InvoiceTitle, PaymentTransaction, CompanyAccount, CompanyProfile } = require('../models');
const { guard } = require('../middleware/auth');
const financeController = require('../controllers/financeController');
const paymentController = require('../controllers/paymentController');
const companyController = require('../controllers/companyController');

module.exports = {
  name: 'finance',
  title: '财务管理',
  dependencies: ['order', 'customer'],
  models: [FinanceRecord, Invoice, InvoiceTitle, PaymentTransaction, CompanyAccount, CompanyProfile],
  routes(router, mw) {
    const g = (...args) => guard('finance', ...args);
    // 费用流水
    router.get('/finance', g('read'), financeController.list);
    router.get('/finance/:id', g('read'), financeController.get);
    router.post('/finance', g('create'), financeController.create);
    router.put('/finance/:id', g('update'), financeController.update);
    router.delete('/finance/:id', g('delete'), financeController.remove);
    router.get('/finance/export', g('read'), financeController.export);
    router.get('/finance/summary', g('read'), financeController.summary);
    router.get('/finance/currency-summary', g('read'), financeController.currencySummary);
    router.get('/finance/customers/:customerId/credit', g('read'), financeController.creditCheck);
    router.get('/finance/monthly-trend', g('read'), financeController.monthlyTrend);
    router.post('/finance/batch-delete', g('delete'), financeController.batchRemove);
    router.post('/finance/batch-update', g('update'), financeController.batchUpdate);
    // 核销/发票
    router.post('/finance/:id/writeoff', g('update'), financeController.writeoff);
    router.get('/finance/invoices', g('read'), financeController.listInvoices);
    router.post('/finance/invoices', g('create'), financeController.issueInvoice);
    router.post('/finance/invoices/:id/cancel', g('update'), financeController.cancelInvoice);
    // 收款
    router.get('/payments', g('read'), paymentController.list);
    router.get('/payments/:id', g('read'), paymentController.get);
    router.post('/payments', g('create'), paymentController.create);
    router.post('/payments/:id/submit', g('update'), paymentController.submit);
    // 公司设置
    router.get('/company/profile', g('read'), companyController.getProfile);
    router.put('/company/profile', g('update'), companyController.updateProfile);
    router.get('/company-accounts', g('read'), companyController.listAccounts);
    router.post('/company-accounts', g('create'), companyController.createAccount);
    router.put('/company-accounts/:id', g('update'), companyController.updateAccount);
    router.delete('/company-accounts/:id', g('delete'), companyController.removeAccount);
    router.get('/invoice-titles', g('read'), companyController.listTitles);
    router.post('/invoice-titles', g('create'), companyController.createTitle);
    router.put('/invoice-titles/:id', g('update'), companyController.updateTitle);
    router.delete('/invoice-titles/:id', g('delete'), companyController.removeTitle);
  },
  services: {},
  menu: { path: '/finance', icon: 'Money', permission: 'finance:read' },
  events: ['finance.created', 'finance.updated', 'finance.deleted', 'finance.billed'],
};
