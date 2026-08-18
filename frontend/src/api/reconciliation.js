import request from './request';

export const reconciliationAPI = {
  receivable: (params) => request.get('/finance/reconcile/receivable', { params }),
  payable: (params) => request.get('/finance/reconcile/payable', { params }),
  perShipment: (params) => request.get('/finance/reconcile/per-shipment', { params }),
};