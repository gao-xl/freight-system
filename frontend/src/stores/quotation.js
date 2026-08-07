import { defineStore } from 'pinia';
import { quotationAPI } from '@/api';

export const useQuotationStore = defineStore('quotation', {
  state: () => ({ list: [], total: 0, detail: null, stats: null, loading: false }),
  actions: {
    async fetchList(params) {
      this.loading = true;
      try {
        const data = await quotationAPI.list(params);
        this.list = data.list;
        this.total = data.total;
        return data;
      } finally {
        this.loading = false;
      }
    },
    async fetchDetail(id) {
      this.detail = await quotationAPI.get(id);
      return this.detail;
    },
    async fetchStats() {
      this.stats = await quotationAPI.stats();
      return this.stats;
    },
    create: (data) => quotationAPI.create(data),
    update: (id, data) => quotationAPI.update(id, data),
    remove: (id) => quotationAPI.remove(id),
    send: (id) => quotationAPI.send(id),
    confirm: (id) => quotationAPI.confirm(id),
    convertOrder: (id, data) => quotationAPI.convertOrder(id, data),
  },
});