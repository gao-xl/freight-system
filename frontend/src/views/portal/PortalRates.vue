<template>
  <div class="rates-panel">
    <div class="rates-toolbar">
      <el-input v-model="form.from" placeholder="起运港" clearable style="width:140px" @keyup.enter="load(1)" />
      <el-input v-model="form.to" placeholder="目的港" clearable style="width:140px" @keyup.enter="load(1)" />
      <el-input v-model="form.keyword" placeholder="船司/航线关键字" clearable style="width:180px" @keyup.enter="load(1)" />
      <el-button type="primary" :icon="Search" @click="load(1)">查询运价</el-button>
    </div>
    <el-table v-if="!unavailable" :data="rows" v-loading="loading" stripe>
      <el-table-column prop="carrier" label="承运商" min-width="110" />
      <el-table-column label="航程" min-width="170">
        <template #default="{ row }">{{ row.route || `${row.originPort || '-'} → ${row.destPort || '-'}` }}</template>
      </el-table-column>
      <el-table-column prop="containerType" label="箱型" width="80" />
      <el-table-column label="价格" width="120" align="right">
        <template #default="{ row }">{{ row.rate }} {{ row.currency }}</template>
      </el-table-column>
      <el-table-column label="有效期" min-width="170">
        <template #default="{ row }">{{ validText(row) }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
    </el-table>
    <el-empty v-if="!unavailable && !loading && !rows.length" description="暂无符合条件的运价" />
    <el-empty v-else-if="unavailable" description="运价查询暂未开放，请联系操作员" />
    <div v-if="!unavailable && total > form.pageSize" class="pager">
      <el-pagination background layout="total, prev, pager, next" :total="total" v-model:current-page="form.page" :page-size="form.pageSize" @current-change="load()" />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { portalAPI } from '@/api';

const loading = ref(false);
const unavailable = ref(false);
const rows = ref([]);
const total = ref(0);
const form = reactive({ from: '', to: '', keyword: '', page: 1, pageSize: 10 });

const fmt = (d) => (d ? String(d).slice(0, 10) : '');
const validText = (row) => {
  if (!row.validFrom && !row.validTo) return '长期有效';
  return `${fmt(row.validFrom) || '即日'} ~ ${fmt(row.validTo) || '长期'}`;
};

async function load(page) {
  if (page) form.page = page;
  loading.value = true;
  try {
    const d = await portalAPI.rates({ from: form.from, to: form.to, keyword: form.keyword, page: form.page, pageSize: form.pageSize });
    rows.value = Array.isArray(d) ? d : d.list || [];
    total.value = d.total ?? rows.value.length;
    unavailable.value = false;
  } catch (e) {
    // 后端未就绪（404）fail-open：显示占位提示，不弹错
    if (e?.response?.status === 404) {
      rows.value = [];
      total.value = 0;
      unavailable.value = true;
    } else {
      rows.value = [];
      total.value = 0;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.rates-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
