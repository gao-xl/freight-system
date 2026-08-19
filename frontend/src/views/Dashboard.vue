<template>
  <div>
    <!-- Onboarding 引导：Dashboard 引导 Checklist（仅未跑通核心链路时展示） -->
    <OnboardingChecklist v-if="auth.role !== 'customer'" />

    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><Odometer /></el-icon>经营看板</div>
      <span class="welcome">欢迎回来，{{ greeting() }}，{{ roleMeta.name }}</span>
    </div>

    <!-- 角色工作台：按角色呈现高频入口与今日待办 -->
    <div class="role-workbench" :style="{ '--rb-accent': roleMeta.accent }">
      <div class="rb-head">
        <div class="rb-identity">
          <div class="rb-role">{{ roleMeta.name }}</div>
          <div class="rb-tagline">{{ roleMeta.tagline }}</div>
        </div>
        <div class="rb-todo" v-if="todoTotal">
          <el-tag size="small" effect="dark" type="danger" v-if="todoSummary.high">{{ todoSummary.high }} 高</el-tag>
          <el-tag size="small" effect="plain" type="warning" v-if="todoSummary.medium">{{ todoSummary.medium }} 中</el-tag>
          <el-tag size="small" effect="plain" type="info" v-if="todoSummary.low">{{ todoSummary.low }} 低</el-tag>
          <span class="rb-todo-total">今日待办 {{ todoTotal }} 项</span>
          <el-button size="small" type="primary" plain @click="router.push('/tasks')"><el-icon><Memo /></el-icon>去处理</el-button>
        </div>
        <div class="rb-todo" v-else>
          <span class="rb-todo-total" style="color:var(--success)">暂无待办，一切就绪</span>
          <el-button size="small" plain @click="router.push('/tasks')"><el-icon><Memo /></el-icon>待办工作台</el-button>
        </div>
      </div>
      <div class="rb-actions">
        <button v-for="a in roleActions" :key="a.label" class="rb-action" @click="router.push(a.path)">
          <el-icon class="rb-action-icon"><component :is="a.icon" /></el-icon>
          <span class="rb-action-label">{{ a.label }}</span>
          <span class="rb-action-desc">{{ a.desc }}</span>
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">订单总数</div>
        <div class="value" style="color:var(--brand)">{{ stats.orderTotal }}</div>
        <div class="sub">进行中 {{ stats.orderInProgress }} · 已完成 {{ stats.orderCompleted }}</div>
        <el-icon class="icon" style="color:var(--brand)"><Document /></el-icon>
      </div>
      <div class="stat-card" style="--stat-accent:var(--warning)">
        <div class="label">待处理订舱</div>
        <div class="value" style="color:var(--warning)">{{ stats.bookingWait }}</div>
        <div class="sub">新订舱 / 已确认</div>
        <el-icon class="icon" style="color:var(--warning)"><Ship /></el-icon>
      </div>
      <div class="stat-card" style="--stat-accent:var(--danger)">
        <div class="label">待放行报关</div>
        <div class="value" style="color:var(--danger)">{{ stats.customsPending }}</div>
        <div class="sub">申报中 / 查验中</div>
        <el-icon class="icon" style="color:var(--danger)"><Stamp /></el-icon>
      </div>
      <div class="stat-card" style="--stat-accent:#7c3aed">
        <div class="label">应收余额</div>
        <div class="value" style="color:#7c3aed">{{ money(stats.receivableBalance) }}</div>
        <div class="sub">应付余额 {{ money(stats.payableBalance) }}</div>
        <el-icon class="icon" style="color:#7c3aed"><Money /></el-icon>
      </div>
      <div class="stat-card" style="--stat-accent:#059669">
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

    <!-- F9 团队工作量视图：经理/管理员视角，看清成员订单负载 -->
    <div class="page-card team-card" style="margin-top:16px">
      <div class="card-title">
        团队工作量
        <el-tag size="small" type="info" style="margin-left:8px">订单负载</el-tag>
      </div>
      <el-table :data="workload.list" size="small" v-loading="workloadLoading">
        <el-table-column prop="name" label="成员" min-width="130">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'" style="margin-left:6px">
              {{ row.status === 'active' ? '在职' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="90">
          <template #default="{ row }">{{ roleText(row.role) }}</template>
        </el-table-column>
        <el-table-column prop="orderTotal" label="订单总数" width="90" align="right" sortable />
        <el-table-column prop="orderActive" label="进行中" width="90" align="right" sortable>
          <template #default="{ row }">
            <span :style="row.orderActive ? 'color:var(--warning);font-weight:600' : ''">{{ row.orderActive }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="orderNewThisMonth" label="本月新增" width="90" align="right" sortable />
        <el-table-column prop="orderCompleted" label="已完成" width="90" align="right" sortable />
        <el-table-column label="负载率" width="150" sortable :sort-by="(r) => r.loadRate">
          <template #default="{ row }">
            <el-progress :percentage="row.loadRate" :stroke-width="12" :color="loadColor(row.loadRate)" />
          </template>
        </el-table-column>
      </el-table>
      <div class="workload-totals" v-if="workload.totals">
        团队合计：订单 {{ workload.totals.orderTotal }} · 进行中 {{ workload.totals.orderActive }} · 本月新增 {{ workload.totals.orderNewThisMonth }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
// ECharts 按需引入（B1 性能优化）：仅注册用到的图表与组件，替代全量 import
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
import { useRouter } from 'vue-router';
import { dashboardAPI, orderStatusDistAPI, modeDistAPI, recentOrdersAPI, dashboardMetricsAPI, dashboardAgingAPI, salesPerformanceAPI, teamWorkloadAPI, todoAPI } from '@/api';
import OnboardingChecklist from '@/components/OnboardingChecklist.vue';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';
import { money } from '@/utils/dicts';

const router = useRouter();
const auth = useAuthStore();
const onboarding = useOnboardingStore();
const stats = ref({});
const recent = ref([]);
const metric = ref({});
const aging = ref({ unbilled: {}, bands: [], settled: {} });
const sales = ref([]);
const workload = ref({ list: [], totals: null });
const workloadLoading = ref(false);
const todoTotal = ref(0);
const todoSummary = ref({});
const statusRef = ref();
const modeRef = ref();
const agingRef = ref();
const salesRef = ref();
let statusChart, modeChart, agingChart, salesChart;

// 角色工作台：按角色呈现差异化高频入口（权限过滤）与配色
const ROLE_META = {
  admin:    { name: '管理员', tagline: '系统管理 · 全量业务视角', accent: '#1f5fbf' },
  manager:  { name: '经理',   tagline: '审批决策 · 经营节奏',   accent: '#7c3aed' },
  operator: { name: '操作员', tagline: '业务执行 · 跟单推进',   accent: '#0d9488' },
  finance:  { name: '财务',   tagline: '资金管理 · 应收把控',   accent: '#d97706' },
  viewer:   { name: '只读',   tagline: '数据总览 · 只读视角',   accent: '#64748b' },
};
const ROLE_ACTIONS = {
  admin: [
    { label: '待办工作台', icon: 'Memo', perm: undefined, path: '/tasks', desc: '今日该做的单' },
    { label: '订单审批', icon: 'Document', perm: 'order:approve', path: '/orders', desc: '待审批订单' },
    { label: '报价审批', icon: 'PriceTag', perm: 'quotation:approve', path: '/quotations', desc: '待审批报价' },
    { label: '放单审批', icon: 'Select', perm: 'release:approve', path: '/orders', desc: '待审批放单' },
    { label: '财务扎帐', icon: 'Money', perm: 'finance:close', path: '/finance', desc: '结账与锁帐' },
    { label: '预警中心', icon: 'Bell', perm: 'alert:read', path: '/alerts', desc: '风险预警' },
    { label: '系统管理', icon: 'Setting', perm: 'system:user', path: '/system', desc: '用户与权限' },
    { label: '系统健康', icon: 'Monitor', perm: 'system:user', path: '/system/health', desc: '运行状态' },
  ],
  manager: [
    { label: '待办工作台', icon: 'Memo', perm: undefined, path: '/tasks', desc: '今日该做的单' },
    { label: '订单审批', icon: 'Document', perm: 'order:approve', path: '/orders', desc: '待审批订单' },
    { label: '报价审批', icon: 'PriceTag', perm: 'quotation:approve', path: '/quotations', desc: '待审批报价' },
    { label: '放单审批', icon: 'Select', perm: 'release:approve', path: '/orders', desc: '待审批放单' },
    { label: '财务扎帐', icon: 'Money', perm: 'finance:close', path: '/finance', desc: '结账与锁帐' },
    { label: '预警中心', icon: 'Bell', perm: 'alert:read', path: '/alerts', desc: '风险预警' },
    { label: '报表设计', icon: 'DataAnalysis', perm: 'dashboard:read', path: '/system/reports', desc: '经营分析' },
  ],
  operator: [
    { label: '待办工作台', icon: 'Memo', perm: undefined, path: '/tasks', desc: '今日该做的单' },
    { label: '新建订单', icon: 'DocumentAdd', perm: 'order:create', path: '/orders', desc: '录入新订单' },
    { label: '待订舱', icon: 'Ship', perm: 'booking:create', path: '/bookings', desc: '订舱操作' },
    { label: '待报关', icon: 'Stamp', perm: 'customs:create', path: '/customs', desc: '报关申报' },
    { label: '运输跟踪', icon: 'MapLocation', perm: 'track:read', path: '/tracking', desc: '节点更新' },
    { label: '放单申请', icon: 'Select', perm: 'release:create', path: '/orders', desc: '申请放单' },
    { label: '预警中心', icon: 'Bell', perm: 'alert:read', path: '/alerts', desc: '风险预警' },
  ],
  finance: [
    { label: '待办工作台', icon: 'Memo', perm: undefined, path: '/tasks', desc: '今日该做的单' },
    { label: '待开票', icon: 'Ticket', perm: 'finance:update', path: '/finance/invoices', desc: '开具发票' },
    { label: '应收核销', icon: 'Money', perm: 'finance:update', path: '/finance', desc: '收款核销' },
    { label: '对账单', icon: 'Tickets', perm: 'finance:read', path: '/finance/statement', desc: '客户对账' },
    { label: '账龄分析', icon: 'DataAnalysis', perm: 'finance:read', path: '/finance', desc: '应收账龄' },
    { label: '结账扎帐', icon: 'Lock', perm: 'finance:close', path: '/finance', desc: '月度扎帐' },
  ],
  viewer: [
    { label: '待办工作台', icon: 'Memo', perm: undefined, path: '/tasks', desc: '今日概览' },
    { label: '订单查询', icon: 'Document', perm: 'order:read', path: '/orders', desc: '订单浏览' },
    { label: '财务查询', icon: 'Money', perm: 'finance:read', path: '/finance', desc: '财务浏览' },
    { label: '预警中心', icon: 'Bell', perm: 'alert:read', path: '/alerts', desc: '风险预警' },
    { label: '报表设计', icon: 'DataAnalysis', perm: 'dashboard:read', path: '/system/reports', desc: '经营分析' },
  ],
};
const roleKey = computed(() => auth.role || 'viewer');
const roleMeta = computed(() => ROLE_META[roleKey.value] || ROLE_META.viewer);
const roleActions = computed(() => ((ROLE_ACTIONS[roleKey.value] || ROLE_ACTIONS.viewer)).filter((a) => auth.hasPermission(a.perm)));

const statusMap = {
  draft: ['草稿', 'info'], confirmed: ['已确认', 'primary'], in_progress: ['进行中', 'warning'],
  completed: ['已完成', 'success'], cancelled: ['已取消', 'danger'],
};
const modeMap = { sea: '海运', air: '空运', land: '陆运', rail: '铁路' };
const roleTextMap = { admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读', customer: '客户' };
const roleText = (r) => roleTextMap[r] || r;
const loadColor = (p) => (p >= 70 ? 'var(--danger, #dc2626)' : p >= 40 ? 'var(--warning, #d97706)' : 'var(--success, #16a34a)');
const statusText = (s) => statusMap[s]?.[0] || s;
const statusType = (s) => statusMap[s]?.[1] || 'info';
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
  // 角色工作台待办聚合（失败不阻塞主看板）
  try {
    const t = await todoAPI();
    todoTotal.value = t.total || 0;
    todoSummary.value = t.summary || {};
  } catch (e) { /* 忽略 */ }
  try {
    const [m, ag, sp] = await Promise.all([dashboardMetricsAPI(), dashboardAgingAPI(), salesPerformanceAPI()]);
    metric.value = m;
    aging.value = ag;
    sales.value = sp.list || [];
    renderAging();
    renderSales();
  } catch (e) { /* 指标接口失败不阻塞主看板 */ }
  // F9 团队工作量（经理/管理员视角，失败静默）
  try {
    workloadLoading.value = true;
    const w = await teamWorkloadAPI();
    workload.value = w;
  } catch (e) { /* 权限不足或异常时静默隐藏 */ }
  finally { workloadLoading.value = false; }
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  [statusChart, modeChart, agingChart, salesChart].forEach((c) => c?.dispose());
});
</script>

<style scoped>
.welcome { font-size: 13px; color: var(--text-muted); }

/* 角色工作台 */
.role-workbench {
  background: linear-gradient(135deg, #ffffff 0%, var(--bg-subtle) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  animation: fadeUp .42s cubic-bezier(.22,.61,.36,1) both;
}
.role-workbench::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--rb-accent);
  border-radius: 0 4px 4px 0;
}
.rb-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.rb-identity { display: flex; align-items: baseline; gap: 10px; }
.rb-role { font-size: 22px; font-weight: 700; color: var(--rb-accent); font-family: var(--font-num); }
.rb-tagline { font-size: 13px; color: var(--text-muted); }
.rb-todo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rb-todo-total { font-size: 13px; color: var(--text-sub); margin-left: 4px; }
.rb-actions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.rb-action {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer; text-align: left;
  transition: transform .16s, box-shadow .16s, border-color .16s;
}
.rb-action:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--rb-accent); }
.rb-action-icon { font-size: 18px; color: var(--rb-accent); }
.rb-action-label { font-size: 13px; font-weight: 600; color: var(--text-main); }
.rb-action-desc { font-size: 12px; color: var(--text-muted); }

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
.workload-totals { margin-top: 12px; font-size: 13px; color: var(--text-sub); background: var(--bg-lighter, #f7f9fc); border-radius: 8px; padding: 10px 14px; }

/* 卡片渐次浮现：自上而下错落入场（stagger），节奏更精致 */
.role-workbench { animation-delay: .00s; }
.stat-grid      { animation: fadeUp .42s cubic-bezier(.22,.61,.36,1) .06s both; }
.chart-grid     { animation: fadeUp .42s cubic-bezier(.22,.61,.36,1) .12s both; }
.metric-grid    { animation: fadeUp .42s cubic-bezier(.22,.61,.36,1) .18s both; }
.team-card      { animation: fadeUp .42s cubic-bezier(.22,.61,.36,1) .24s both; }

/* 窄屏适配：图表与指标卡堆叠为单/双列 */
@media (max-width: 768px) {
  .chart-grid { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .metric-value { font-size: 22px; }
}
</style>