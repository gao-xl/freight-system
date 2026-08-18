// P3-2 预算管理 API
import request from '@/utils/request';

export const budgetAPI = {
  list: (params) => request.get('/budgets', { params }),
  detail: (id) => request.get(`/budgets/${id}`),
  create: (data) => request.post('/budgets', data),
  addLine: (id, data) => request.post(`/budgets/${id}/lines`, data),
  updateLine: (id, lineId, data) => request.put(`/budgets/${id}/lines/${lineId}`, data),
  removeLine: (id, lineId) => request.delete(`/budgets/${id}/lines/${lineId}`),
  transition: (id, target) => request.post(`/budgets/${id}/status?target=${target}`),
  createAdjustment: (id, data) => request.post(`/budgets/${id}/adjustments`, data),
  reviewAdjustment: (adjId, approve, rejectReason = '') => request.post(`/budgets/adjustments/${adjId}/review?approve=${approve}&rejectReason=${encodeURIComponent(rejectReason)}`),
};

// 费用类别选项（与 FinanceRecord.category 对齐）
export const BUDGET_CATEGORIES = [
  { key: 'ocean_freight', label: '海运费' },
  { key: 'air_freight', label: '空运费' },
  { key: 'local_charge', label: '港口杂费' },
  { key: 'customs_fee', label: '报关费' },
  { key: 'document_fee', label: '单证费' },
  { key: 'warehouse_fee', label: '仓储费' },
  { key: 'transport_fee', label: '内陆运费' },
  { key: 'other', label: '其他' },
];
export const budgetCategoryLabel = (k) => BUDGET_CATEGORIES.find((c) => c.key === k)?.label || k;