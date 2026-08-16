import request from './request';

const crud = (resource) => ({
  list: (params) => request.get(`/${resource}`, { params }),
  get: (id) => request.get(`/${resource}/${id}`),
  create: (data) => request.post(`/${resource}`, data),
  update: (id, data) => request.put(`/${resource}/${id}`, data),
  remove: (id) => request.delete(`/${resource}/${id}`),
  restore: (id) => request.post(`/${resource}/${id}/restore`),
});

export const financeAPI = {
  ...crud('finance'),
  currencySummary: (p) => request.get('/finance/currency-summary', { params: p }),
  currencyReconcile: (p) => request.get('/finance/currency-reconcile', { params: p }), // P3 币种级对账
  creditCheck: (id, p) => request.get(`/finance/customers/${id}/credit`, { params: p }),
};
export const financeBatchAPI = (data) => request.post('/finance/batch', data); // N1 批量建费
export const financePaymentAPI = (data) => request.post('/finance/payments', data); // N3 收款核销
export const feeTemplateAPI = crud('fee-templates'); // N1 费用模板
export const financeSummaryAPI = () => request.get('/finance/summary');
export const financeAgingAPI = () => request.get('/finance/aging'); // N5 AR 账龄
export const financeTrendAPI = (year) => request.get(`/finance/monthly-trend?year=${year}`);
export const financeProfitCompareAPI = (params) => request.get('/finance/profit-compare', { params });
export const financeExportAPI = () => request.get('/finance/export', { responseType: 'blob' });
// 财务对账/开票/核销（B4, N2）
export const financeReconcileAPI = (params) => request.get('/finance/reconcile', { params });
export const invoiceAPI = {
  list: (params) => request.get('/finance/invoices', { params }),
  create: (data) => request.post('/finance/invoices', data),
  fromFees: (data) => request.post('/finance/invoices/from-fees', data), // N2 从费用生成发票
  issue: (id) => request.post(`/finance/invoices/${id}/issue`),
  batchIssue: (ids) => request.post('/finance/invoices/batch-issue', { ids }), // E3 批量开票
  cancel: (id) => request.post(`/finance/invoices/${id}/cancel`),
  // 数电票批量导入文件
  digitalTaxPreview: (invoiceIds) => request.post('/finance/invoices/digital-tax-preview', { invoiceIds }),
  digitalTaxExport: (data) => request.post('/finance/invoices/digital-tax-export', data, { responseType: 'blob' }),
};
export const financeWriteoffAPI = (id, data) => request.post(`/finance/${id}/writeoff`, data);
export const financeBatchWriteoffAPI = (ids, amount) => request.post('/finance/batch-writeoff', { ids, amount });
// P0.1 红字冲销
export const financeReverseAPI = (id, data) => request.post(`/finance/${id}/reverse`, data);
export const financeReversalsAPI = (id) => request.get(`/finance/${id}/reversals`);
// 结账/扎帐/锁帐：账期管理
export const financePeriodsAPI = (year) => request.get('/finance/periods', { params: { year } });
export const financeEnsurePeriodsAPI = () => request.post('/finance/periods/ensure');
export const financeClosePeriodAPI = (code, data) => request.post(`/finance/periods/${code}/close`, data);
export const financeLockPeriodAPI = (code, data) => request.post(`/finance/periods/${code}/lock`, data);
export const financeUnlockPeriodAPI = (code, data) => request.post(`/finance/periods/${code}/unlock`, data);
export const financePeriodStatementAPI = (code) => request.get(`/finance/periods/${code}/statement`);
// P2.4 对账单
export const financeStatementAPI = (params) => request.get('/finance/statement', { params });
// 多币种：汇率管理（月固定汇率，period=YYYY-MM）
export const exchangeRateAPI = {
  list: (params) => request.get('/exchange-rates', { params }),
  update: (id, data) => request.put(`/exchange-rates/${id}`, data),
  upsert: (data) => request.post('/exchange-rates', data),
  refresh: (data) => request.post('/exchange-rates/refresh', data),
  convert: (data) => request.post('/exchange-rates/convert', data),
};
// 系统默认币种（CompanyProfile.defaultCurrency）
export const systemDefaultsAPI = {
  get: () => request.get('/system/defaults'),
};