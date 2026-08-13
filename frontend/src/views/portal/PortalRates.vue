<template>
  <div class="rates-panel">
    <div class="rates-toolbar">
      <el-input v-model="form.from" placeholder="起运港" clearable style="width:130px" @keyup.enter="load(1)" />
      <el-input v-model="form.to" placeholder="目的港" clearable style="width:130px" @keyup.enter="load(1)" />
      <el-select v-model="form.containerType" placeholder="箱型" clearable style="width:110px">
        <el-option v-for="t in ['20GP', '40GP', '40HQ']" :key="t" :label="t" :value="t" />
      </el-select>
      <el-input v-model="form.keyword" placeholder="船司/航线关键字" clearable style="width:170px" @keyup.enter="load(1)" />
      <el-button type="primary" :icon="Search" @click="load(1)">查询运价</el-button>
      <el-radio-group v-model="form.mode" size="small" style="margin-left:auto" @change="onModeChange">
        <el-radio-button value="list">全部</el-radio-button>
        <el-radio-button value="compare">比价</el-radio-button>
        <el-radio-button value="recommend">智能推荐</el-radio-button>
      </el-radio-group>
    </div>
    <el-alert v-if="form.mode === 'compare' && !unavailable" type="success" :closable="false" show-icon
      :title="compareSummary" style="margin-bottom:10px" />
    <template v-if="form.mode === 'recommend'">
      <div v-if="rec" class="rec-panel">
        <div class="rec-head">
          <span class="rec-title">运价智能推荐</span>
          <el-tag :type="trendTagType" size="small" effect="dark">{{ rec.trendLabel }}</el-tag>
        </div>
        <div class="rec-metrics">
          <div class="rec-metric"><span class="lbl">当前航线均价</span><b>{{ rec.currentAvg ?? '-' }}</b></div>
          <div class="rec-metric"><span class="lbl">历史成交均价</span><b>{{ rec.histAvg ?? '-' }}</b></div>
          <div class="rec-metric"><span class="lbl">历史成交次数</span><b>{{ rec.histCount ?? 0 }}</b></div>
          <div class="rec-metric"><span class="lbl">历史区间</span><b>{{ rec.histMin ?? '-' }} ~ {{ rec.histMax ?? '-' }}</b></div>
        </div>
      </div>
      <el-table :data="rec?.candidates || []" v-loading="loading" stripe
        :row-class-name="({ row }) => (row.recommended ? 'best-price-row' : '')">
        <el-table-column label="推荐" width="90" align="center">
          <template #default="{ row }"><el-tag v-if="row.recommended" type="danger" size="small" effect="dark">推荐</el-tag></template>
        </el-table-column>
        <el-table-column prop="carrier" label="承运商" min-width="110" />
        <el-table-column prop="containerType" label="箱型" width="80" />
        <el-table-column label="价格" width="120" align="right">
          <template #default="{ row }"><span :class="{ 'best-price': row.recommended }">{{ row.rate }} {{ row.currency }}</span></template>
        </el-table-column>
        <el-table-column label="相对历史均价" width="130" align="right">
          <template #default="{ row }">
            <span v-if="row.vsHistAvg !== null" :class="row.vsHistAvg >= 0 ? 'cheaper' : 'dearer'">
              {{ row.vsHistAvg >= 0 ? '低' : '高' }} {{ Math.abs(row.vsHistAvg) }}%
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="有效期" min-width="170">
          <template #default="{ row }">{{ validText(row) }}</template>
        </el-table-column>
      </el-table>
    </template>
    <el-table v-else-if="!unavailable" :data="rows" v-loading="loading" stripe
      :row-class-name="({ row }) => (row.best ? 'best-price-row' : '')">
      <el-table-column label="最优" width="70" align="center">
        <template #default="{ row }"><el-tag v-if="row.best" type="danger" size="small" effect="dark">最优</el-tag></template>
      </el-table-column>
      <el-table-column prop="carrier" label="承运商" min-width="110" />
      <el-table-column label="航程" min-width="170">
        <template #default="{ row }">{{ row.route || `${row.originPort || '-'} → ${row.destPort || '-'}` }}</template>
      </el-table-column>
      <el-table-column prop="containerType" label="箱型" width="80" />
      <el-table-column label="价格" width="120" align="right">
        <template #default="{ row }"><span :class="{ 'best-price': row.best }">{{ row.rate }} {{ row.currency }}</span></template>
      </el-table-column>
      <el-table-column label="有效期" min-width="170">
        <template #default="{ row }">{{ validText(row) }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
    </el-table>
    <el-empty v-if="!unavailable && form.mode !== 'recommend' && !loading && !rows.length" description="暂无符合条件的运价" />
    <el-empty v-else-if="form.mode === 'recommend' && !loading && rec && !rec.candidates.length" description="该航线暂无有效运价，无法生成推荐" />
    <el-empty v-else-if="unavailable" description="运价查询暂未开放，请联系操作员" />
    <div v-if="!unavailable && total > form.pageSize" class="pager">
      <el-pagination background layout="total, prev, pager, next" :total="total" v-model:current-page="form.page" :page-size="form.pageSize" @current-change="load()" />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { portalAPI } from '@/api';

const loading = ref(false);
const unavailable = ref(false);
const rows = ref([]);
const rec = ref(null);
const total = ref(0);
const form = reactive({ from: '', to: '', keyword: '', page: 1, pageSize: 10, containerType: '', mode: 'list' });

const trendTagType = computed(() => ({
  up: 'warning', down: 'success', flat: 'info', '': 'info',
}[rec.value?.trend] ?? 'info'));

function onModeChange() {
  rows.value = [];
  rec.value = null;
  load(1);
}

const fmt = (d) => (d ? String(d).slice(0, 10) : '');
const validText = (row) => {
  if (!row.validFrom && !row.validTo) return '长期有效';
  return `${fmt(row.validFrom) || '即日'} ~ ${fmt(row.validTo) || '长期'}`;
};
// P1-N1 修复：compareSummary 改为 computed，模板 :title 自动解包并响应 rows 变化
const compareSummary = computed(() => {
  if (!rows.value.length) return '暂无该航线运价，可尝试放宽筛选条件';
  const best = rows.value.filter((r) => r.best);
  if (!best.length) return '当前航线下有多家承运商可对比';
  const b = best[0];
  return `当前最优：${b.carrier}  ${b.containerType} ${b.rate} ${b.currency}`;
});

async function load(page) {
  if (page) form.page = page;
  loading.value = true;
  try {
    const d = await portalAPI.rates({ from: form.from, to: form.to, keyword: form.keyword, containerType: form.containerType, mode: form.mode, page: form.page, pageSize: form.pageSize });
    if (form.mode === 'recommend') {
      rec.value = Array.isArray(d) ? null : d;
      rows.value = [];
      total.value = 0;
    } else {
      rows.value = Array.isArray(d) ? d : d.list || [];
      total.value = d.total ?? rows.value.length;
      rec.value = null;
    }
    unavailable.value = false;
  } catch (e) {
    // 后端未就绪（404）fail-open：显示占位提示，不弹错
    if (e?.response?.status === 404) {
      rows.value = [];
      total.value = 0;
      rec.value = null;
      unavailable.value = true;
    } else {
      // P2-N3 修复：非 404 错误（500/网络等）给出提示，避免空白表格无反馈
      rows.value = [];
      total.value = 0;
      rec.value = null;
      ElMessage.warning('运价查询失败，请稍后重试');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.rates-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.best-price { color: var(--el-color-danger); font-weight: 700; }
.best-price-row :deep(td) { background: var(--el-color-danger-light-9) !important; }
.rec-panel { border: 1px solid var(--el-color-primary-light-7); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; background: var(--el-color-primary-light-9); }
.rec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.rec-title { font-weight: 700; font-size: 15px; }
.rec-metrics { display: flex; gap: 28px; flex-wrap: wrap; }
.rec-metric { display: flex; flex-direction: column; gap: 2px; }
.rec-metric .lbl { font-size: 12px; color: var(--el-text-color-secondary); }
.rec-metric b { font-size: 16px; }
.cheaper { color: var(--el-color-success); font-weight: 600; }
.dearer { color: var(--el-color-warning); font-weight: 600; }
</style>
