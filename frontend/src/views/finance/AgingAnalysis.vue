<template>
  <div class="page-card">
    <div class="topbar">
      <h3>应收账龄分析</h3>
      <div class="actions">
        <el-button @click="load" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
    </div>

    <!-- 总览卡片 -->
    <el-row :gutter="12" class="stat-bar">
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card">
          <div class="stat-num">{{ money(data.totalBalance) }}</div>
          <div class="stat-label">应收未收总额</div>
        </el-card>
      </el-col>
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card stat-card--safe">
          <div class="stat-num">{{ money(data.buckets?.['0-30']?.total) }}</div>
          <div class="stat-label">0-30天</div>
        </el-card>
      </el-col>
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card stat-card--warn">
          <div class="stat-num">{{ money(data.buckets?.['31-60']?.total) }}</div>
          <div class="stat-label">31-60天</div>
        </el-card>
      </el-col>
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card stat-card--risk">
          <div class="stat-num">{{ money(data.buckets?.['61-90']?.total) }}</div>
          <div class="stat-label">61-90天</div>
        </el-card>
      </el-col>
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card stat-card--danger">
          <div class="stat-num">{{ money(data.buckets?.['90+']?.total) }}</div>
          <div class="stat-label">90天以上</div>
        </el-card>
      </el-col>
      <el-col :span="4" :xs="12">
        <el-card shadow="never" class="stat-card">
          <div class="stat-num">{{ data.customers?.length || 0 }}</div>
          <div class="stat-label">欠款客户数</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 账龄柱状图 -->
    <el-card shadow="never" class="chart-card">
      <template #header>账龄分布</template>
      <div class="bar-chart">
        <div v-for="b in bars" :key="b.key" class="bar-group">
          <div class="bar-label">{{ b.label }}</div>
          <div class="bar-track">
            <div class="bar-fill" :class="b.cls" :style="{ width: maxTotal > 0 ? (b.total / maxTotal * 100) + '%' : '0%' }">
              <span class="bar-val">{{ money(b.total) }}</span>
            </div>
          </div>
          <div class="bar-pct">{{ pct(b.total) }}</div>
        </div>
      </div>
    </el-card>

    <!-- 客户账龄明细 -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="table-header">
          <span>客户账龄明细</span>
          <el-input v-model="search" placeholder="搜索客户名称" clearable style="width:220px" size="small">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
      </template>
      <el-table :data="filteredCustomers" v-loading="loading" stripe :default-sort="{ prop: 'balance', order: 'descending' }">
        <template #empty>
          <EmptyGuide v-if="!loading" :mode="search ? 'filtered' : 'guide'"
            title="暂无应收数据" hint="当有未结清的应收款时，系统将自动按账龄分桶展示。"
            @reset="search = ''" />
        </template>
        <el-table-column prop="name" label="客户" min-width="200" sortable />
        <el-table-column label="应收余额" width="140" align="right" sortable prop="balance">
          <template #default="{row}">{{ money(row.balance) }}</template>
        </el-table-column>
        <el-table-column label="0-30天" width="120" align="right">
          <template #default="{row}">
            <span :class="{ 'text-warn': (row.buckets?.['0-30'] || 0) > 0 }">{{ money(row.buckets?.['0-30']) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="31-60天" width="120" align="right">
          <template #default="{row}">
            <span :class="{ 'text-risk': (row.buckets?.['31-60'] || 0) > 0 }">{{ money(row.buckets?.['31-60']) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="61-90天" width="120" align="right">
          <template #default="{row}">
            <span :class="{ 'text-danger': (row.buckets?.['61-90'] || 0) > 0 }">{{ money(row.buckets?.['61-90']) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="90天以上" width="130" align="right">
          <template #default="{row}">
            <span :class="{ 'text-danger-bold': (row.buckets?.['90+'] || 0) > 0 }">{{ money(row.buckets?.['90+']) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="占比" width="90" align="center">
          <template #default="{row}">
            <el-progress :percentage="pctNum(row.balance)" :stroke-width="6" :show-text="false"
              :color="row.buckets?.['90+'] > 0 ? '#f56c6c' : row.buckets?.['61-90'] > 0 ? '#e6a23c' : '#409eff'" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div class="footer-note">生成时间：{{ data.generatedAt ? fmtTime(data.generatedAt) : '-' }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { financeAgingAPI } from '@/api';
import { money } from '@/utils/dicts';
import EmptyGuide from '@/components/EmptyGuide.vue';

const loading = ref(false);
const search = ref('');
const data = reactive({
  totalBalance: 0,
  agedTotal: 0,
  buckets: {},
  customers: [],
  generatedAt: null,
});

const bars = computed(() => [
  { key: '0-30', label: '0-30天', total: data.buckets?.['0-30']?.total || 0, cls: 'bar-safe' },
  { key: '31-60', label: '31-60天', total: data.buckets?.['31-60']?.total || 0, cls: 'bar-warn' },
  { key: '61-90', label: '61-90天', total: data.buckets?.['61-90']?.total || 0, cls: 'bar-risk' },
  { key: '90+', label: '90天以上', total: data.buckets?.['90+']?.total || 0, cls: 'bar-danger' },
]);

const maxTotal = computed(() => Math.max(...bars.value.map((b) => b.total), 1));

const filteredCustomers = computed(() => {
  if (!search.value) return data.customers || [];
  const q = search.value.toLowerCase();
  return (data.customers || []).filter((c) => c.name.toLowerCase().includes(q));
});

function pct(val) {
  if (!data.totalBalance || data.totalBalance === 0) return '0%';
  return ((val / data.totalBalance) * 100).toFixed(1) + '%';
}

function pctNum(val) {
  if (!data.totalBalance || data.totalBalance === 0) return 0;
  return Math.round((val / data.totalBalance) * 100);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function load() {
  loading.value = true;
  try {
    const res = await financeAgingAPI();
    Object.assign(data, res.data || res);
  } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.topbar h3 { margin: 0; }
.actions { display: flex; gap: 8px; }
.stat-bar { margin-bottom: 16px; }
.stat-card { text-align: center; border-radius: 10px; }
.stat-card--safe { border-left: 3px solid #67c23a; }
.stat-card--warn { border-left: 3px solid #e6a23c; }
.stat-card--risk { border-left: 3px solid #f56c6c; }
.stat-card--danger { border-left: 3px solid #c45656; }
.stat-num { font-size: 22px; font-weight: 700; color: var(--brand); }
.stat-card--danger .stat-num { color: #c45656; }
.stat-card--risk .stat-num { color: #f56c6c; }
.stat-card--warn .stat-num { color: #e6a23c; }
.stat-label { font-size: 12px; color: var(--text-sub); margin-top: 4px; }
.chart-card { margin-bottom: 16px; }
.bar-chart { display: flex; flex-direction: column; gap: 12px; }
.bar-group { display: flex; align-items: center; gap: 12px; }
.bar-label { width: 80px; font-size: 13px; color: var(--text-sub); text-align: right; flex-shrink: 0; }
.bar-track { flex: 1; height: 28px; background: var(--fill); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 6px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; min-width: 60px; transition: width 0.5s ease; }
.bar-fill.bar-safe { background: #67c23a; }
.bar-fill.bar-warn { background: #e6a23c; }
.bar-fill.bar-risk { background: #f56c6c; }
.bar-fill.bar-danger { background: #c45656; }
.bar-val { font-size: 12px; color: #fff; font-weight: 600; white-space: nowrap; }
.bar-pct { width: 50px; font-size: 12px; color: var(--text-sub); flex-shrink: 0; }
.table-card { margin-bottom: 16px; }
.table-header { display: flex; justify-content: space-between; align-items: center; }
.text-warn { color: #e6a23c; font-weight: 600; }
.text-risk { color: #f56c6c; font-weight: 600; }
.text-danger { color: #f56c6c; font-weight: 600; }
.text-danger-bold { color: #c45656; font-weight: 700; }
.footer-note { text-align: right; font-size: 12px; color: var(--text-muted); }
</style>