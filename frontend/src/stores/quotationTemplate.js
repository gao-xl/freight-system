import { defineStore } from 'pinia';
import { quotationTemplateAPI } from '@/api';

export const useQuotationTemplateStore = defineStore('quotationTemplate', {
  state: () => ({ list: [], total: 0, loading: false }),
  actions: {
    async fetchList(params) {
      this.loading = true;
      try {
        const data = await quotationTemplateAPI.list(params);
        this.list = data.list;
        this.total = data.total;
        return data;
      } finally { this.loading = false; }
    },
    async match(params) {
      return await quotationTemplateAPI.match(params);
    },
    create: (data) => quotationTemplateAPI.create(data),
    update: (id, data) => quotationTemplateAPI.update(id, data),
    remove: (id) => quotationTemplateAPI.remove(id),
  },
});