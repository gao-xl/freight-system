<template>
  <div>
    <!-- Onboarding 引导：Dashboard 引导 Checklist（仅未跑通核心链路时展示） -->
    <OnboardingChecklist v-if="auth.role !== 'customer'" />

    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><Odometer /></el-icon>经营看板</div>
      <span class="welcome">欢迎回来，{{ greeting() }}</span>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">订单总数</div>
        <div class="value" style="color:var(--brand)">{{ stats.orderTotal }}</div>
        <div class="sub">进行中 {{ stats.orderInProgress }} · 已完成 {{ stats.orderCompleted }}</div>
        <el-icon class="icon" style="color:var(--brand)"><Document /></el-icon>
      </div>
      <div class="stat-card" style="border-color:var(--warning)">
        <div class="label">待处理订舱</div>
        <div class="value" style="color:var(--warning)">{{ stats.bookingWait }}</div>
        <div class="sub">新订舱 / 已确认</div>
        <el-icon class="icon" style="color:var(--warning)"><Ship /></el-icon>
      </div>
      <div class="stat-card" style="border-color:var(--danger)">
        <div class="label">待放行报关</div>
        <div class="value" style="color:var(--danger)">{{ stats.customsPending }}</div>
        <div class="sub">申报中 / 查验中</div>
        <el-icon class="icon" style="color:var(--danger)"><Stamp /></el-icon>
      </div>
      <div class="stat-card" style="border-color:#7c3aed">
        <div class="label">应收余额</div>
        <div class="value" style="color:#7c3aed">{{ money(stats.receivableBalance) }}</div>
        <div class="sub">应付余额 {{ money(stats.payableBalance) }}</div>
        <el-icon class="icon" style="color:#7c3aed"><Money /></el-icon>
      </div>
      <div class="stat-card" style="border-color:#059669">
        <div class="label">客户 / 供应商</div>
        <div class="value" style="color:#059669">{{ stats.customerTotal }} <span style="font-size:16px">/</span> {{ stats.supplierTotal }}</div>
        <div class="sub">活跃资源池</div>
        <el-icon class="icon" style="color:#059669"><OfficeBuilding /></el-icon>
      </div>
    </div>

    <div class="chart-grid">
      <div class="page-card chart-card">
        <div class="card-title">订单状态分布</div>
        <div ref="statusRef" class="chart"></div>
      </div>
      <div class="page-card chart-card">
        <div class="card-title">运输模式分布</div>
        <div ref="modeRef" class="chart"></div>
      </div>
      <div class="page-card chart-card wide">
        <div class="card-title">最近订单动态</div>
        <el-table :data="recent" size="small" @row-click="goDetail" style="cursor:pointer">
          <el-table-column prop="orderNo" label="订单号" width="150" />
          <el-table-column label="客户" min-width="150">
            <template #default="{ row }">{{ row.customer?.name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="cargoDesc" label="货物" min-width="120" />
          <el-table-column label="航线" min-width="150">
            <template #default="{ row }">{{ row.originPort }} → {{ row.destPort }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="金额(USD)" width="110" align="right">
            <template #default="{ row }">{{ money(row.totalAmount) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- B1 经营指标 -->
    <div class="metric-grid">
      <div class="page-card metric-card">
        <div class="card-title">回款率</div>
        <div class="metric-value" style="color:var(--brand)">{{ metric.collectionRate }}%</div>
        <div class="sub">已收 {{ money(metric.received) }} / 应收 {{ money(metric.receivable) }}</div>
      </div>
      <div class="page-card metric-card">
        <div class="card-title">毛利率</div>
        <div class="metric-value" style="color:#059669">{{ metric.marginRate }}%</div>
        <div class="sub">利润 {{ money(metric.profit) }}</div>
      </div>
      <div class="page-card metric-card">
        <div class="card-title">应收余额</div>
        <div class="metric-value" style="color:#7c3aed">{{ money(metric.receivableBalance) }}</div>
        <div class="sub">含账龄 {{ money(aging.totalUnpaid) }} 未收</div>
      </div>
      <div class="page-card metric-card">
        <div class="card-title">应付余额</div>
        <div class="metric-value" style="color:#dc2626">{{ money(metric.payableBalance) }}</div>
        <div class="sub">应付 {{ money(metric.payable) }} / 已付 {{ money(metric.paid) }}</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="page-card chart-card">
        <div class="card-title">应收账龄分析</div>
        <div ref="agingRef" class="chart"></div>
      </div>
      <div class="page-card chart-card">
        <div class="card-title">业务员业绩排行</div>
        <div ref="salesRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as echarts from 'echarts';
import { useRouter } from 'vue-router';
import { dashboardAPI, orderStatusDistAPI, modeDistAPI, recentOrdersAPI, dashboardMetricsAPI, dashboardAgingAPI, salesPerformanceAPI } from '@/api';
import OnboardingChecklist from '@/components/OnboardingChecklist.vue';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';

const router = useRouter();
const auth = useAuthStore();
const onboarding = useOnboardingStore();
const stats = ref({});
const recent = ref([]);
const metric = ref({});
const aging = ref({ unbilled: {}, bands: [], settled: {} });
const sales = ref([]);
const statusRef = ref();
const modeRef = ref();
const agingRef = ref();
const salesRef = ref();
let statusChart, modeChart, agingChart, salesChart;

const statusMap = {
  draft: ['草稿', 'info'], confirmed: ['已确认', 'primary'], in_progress: ['进行中', 'warning'],
  completed: ['已完成', 'success'], cancelled: ['已取消', 'danger'],
};
const modeMap = { sea: '海运', air: '空运', land: '陆运', rail: '铁路' };
const statusText = (s) => statusMap[s]?.[0] || s;
const statusType = (s) => statusMap[s]?.[1] || 'info';
const money = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const goDetail = (row) => router.push(`/orders/${row.id}`);
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 精致图表调色板
const PALETTE = ['#1f5fbf', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#f59e0b', '#64748b'];

function renderCharts(statusData, modeData) {
  statusChart = echarts.init(statusRef.value);
  statusChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: 'var(--border)', textStyle: { color: 'var(--text-main)' }, boxShadow: '0 4px 12px rgba(16,24,40,0.1)' },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12, color: 'var(--text-sub)' } },
    color: PALETTE,
    series: [{
      type: 'pie', radius: ['44%', '68%'], center: ['50%', '44%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}: {c}', color: 'var(--text-sub)', fontSize: 12 },
      emphasis: { scaleSize: 6 },
      data: statusData.map((d) => ({ name: statusText(d.name) || d.name, value: d.value })),
    }],
  });

  modeChart = echarts.init(modeRef.value);
  modeChart.setOption({
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: 'var(--border)', textStyle: { color: 'var(--text-main)' } },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 12, color: 'var(--text-sub)' } },
    color: PALETTE,
    series: [{
      type: 'pie', roseType: 'radius', radius: ['25%', '65%'], center: ['50%', '44%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}: {c}', color: 'var(--text-sub)', fontSize: 12 },
      data: modeData.map((d) => ({ name: modeMap[d.name] || d.name, value: d.value })),
    }],
  });
}

function renderAging() {
  agingChart = echarts.init(agingRef.value);
  agingChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: 'var(--border)', textStyle: { color: 'var(--text-main)' } },
    grid: { left: 64, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: ['未到期', ...aging.value.bands.map((b) => b.label), '已结清'], axisLine: { lineStyle: { color: 'var(--border)' } }, axisLabel: { color: 'var(--text-sub)' } },
    yAxis: { type: 'value', name: 'USD', nameTextStyle: { color: 'var(--text-muted)' }, axisLabel: { color: 'var(--text-sub)' }, splitLine: { lineStyle: { color: 'var(--border-lighter, #eef1f5)' } } },
    series: [{
      type: 'bar', barWidth: 34,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      data: [
        { value: aging.value.unbilled.amount, itemStyle: { color: '#0d9488' } },
        ...aging.value.bands.map((b) => ({ value: b.amount, itemStyle: { color: b.key === 'd0_30' ? '#f59e0b' : b.key === 'd31_60' ? '#f97316' : '#dc2626' } })),
        { value: aging.value.settled.amount, itemStyle: { color: '#94a3b8' } },
      ],
      label: { show: true, position: 'top', formatter: (p) => money(p.value), color: 'var(--text-sub)', fontSize: 11 },
    }],
  });
}

function renderSales() {
  salesChart = echarts.init(salesRef.value);
  const names = sales.value.map((s) => s.name);
  const margins = sales.value.map((s) => s.margin);
  salesChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: 'var(--border)', textStyle: { color: 'var(--text-main)' } },
    grid: { left: 84, right: 34, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '毛利(USD)', nameTextStyle: { color: 'var(--text-muted)' }, axisLabel: { color: 'var(--text-sub)' }, splitLine: { lineStyle: { color: 'var(--border-lighter, #eef1f5)' } } },
    yAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: 'var(--border)' } }, axisLabel: { color: 'var(--text-sub)' } },
    series: [{
      type: 'bar', barWidth: 16, data: margins,
      itemStyle: { borderRadius: [0, 6, 6, 0], color: '#1f5fbf' },
      label: { show: true, position: 'right', formatter: (p) => money(p.value), color: 'var(--text-sub)', fontSize: 11 },
    }],
  });
}

function resize() { [statusChart, modeChart, agingChart, salesChart].forEach((c) => c?.resize()); }

onMounted(async () => {
  const [s, st, md, ro] = await Promise.all([
    dashboardAPI(), orderStatusDistAPI(), modeDistAPI(), recentOrdersAPI(8),
  ]);
  stats.value = s;
  recent.value = ro;
  // Onboarding：同步完成度数据（Checklist 进度派生自真实数据，权威源 /onboarding/status）
  onboarding.fetchStatus();
  renderCharts(st, md);
  try {
    const [m, ag, sp] = await Promise.all([dashboardMetricsAPI(), dashboardAgingAPI(), salesPerformanceAPI()]);
    metric.value = m;
    aging.value = ag;
    sales.value = sp.list || [];
    renderAging();
    renderSales();
  } catch (e) { /* 指标接口失败不阻塞主看板 */ }
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  [statusChart, modeChart, agingChart, salesChart].forEach((c) => c?.dispose());
});
</script>

<style scoped>
.welcome { font-size: 13px; color: var(--text-muted); }
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 16px 0;
}
.metric-card { text-align: center; }
.metric-value { font-size: 26px; font-weight: 700; margin: 6px 0; font-family: var(--font-num); }
.chart-card.wide { grid-column: 1 / -1; }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: var(--text-main); }
.chart { height: 300px; }

/* 卡片渐次浮现 */
.stat-grid { animation: fadeUp .3s ease both; }
.chart-grid { animation: fadeUp .38s ease both; }
.metric-grid { animation: fadeUp .46s ease both; }

/* 窄屏适配：图表与指标卡堆叠为单/双列 */
@media (max-width: 768px) {
  .chart-grid { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .metric-value { font-size: 22px; }
}
</style>