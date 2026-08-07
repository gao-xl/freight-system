<template>
  <div>
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

const router = useRouter();
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

function renderCharts(statusData, modeData) {
  statusChart = echarts.init(statusRef.value);
  statusChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['42%', '68%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}: {c}' },
      data: statusData.map((d) => ({ name: statusText(d.name) || d.name, value: d.value })),
    }],
  });

  modeChart = echarts.init(modeRef.value);
  modeChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', roseType: 'radius', radius: ['25%', '65%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}: {c}' },
      data: modeData.map((d) => ({ name: modeMap[d.name] || d.name, value: d.value })),
    }],
  });
}

function renderAging() {
  agingChart = echarts.init(agingRef.value);
  agingChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: ['未到期', ...aging.value.bands.map((b) => b.label), '已结清'] },
    yAxis: { type: 'value', name: 'USD' },
    series: [{
      type: 'bar', barWidth: 40,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      data: [
        { value: aging.value.unbilled.amount, itemStyle: { color: '#059669' } },
        ...aging.value.bands.map((b) => ({ value: b.amount, itemStyle: { color: b.key === 'd0_30' ? '#f59e0b' : b.key === 'd31_60' ? '#f97316' : '#dc2626' } })),
        { value: aging.value.settled.amount, itemStyle: { color: '#94a3b8' } },
      ],
      label: { show: true, position: 'top', formatter: (p) => money(p.value) },
    }],
  });
}

function renderSales() {
  salesChart = echarts.init(salesRef.value);
  const names = sales.value.map((s) => s.name);
  const margins = sales.value.map((s) => s.margin);
  salesChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '毛利(USD)' },
    yAxis: { type: 'category', data: names },
    series: [{
      type: 'bar', barWidth: 16, data: margins,
      itemStyle: { borderRadius: [0, 6, 6, 0], color: '#2563eb' },
      label: { show: true, position: 'right', formatter: (p) => money(p.value) },
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
.metric-value { font-size: 26px; font-weight: 700; margin: 6px 0; }
.chart-card.wide { grid-column: 1 / -1; }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; color: var(--text-main); }
.chart { height: 300px; }
.chart-card.wide .chart-card-table { }
</style>