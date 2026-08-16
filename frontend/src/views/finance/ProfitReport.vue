<template>
  <div>
    <div class="page-heading">
      <div class="title"><el-icon><DataAnalysis /></el-icon>利润报表</div>
      <span class="page-desc">月度趋势 · 利润对比 · 分组排行</span>
    </div>

    <!-- 筛选栏 -->
    <div class="page-card" style="margin-bottom:16px;padding:12px 16px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <el-select v-model="year" style="width:130px" @change="loadAll">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-button @click="loadAll" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
        <span style="font-size:12px;color:var(--text-muted)">数据口径：本币折算金额（localAmount），多币种自动换算</span>
      </div>
    </div>

    <!-- 汇总卡片 -->
    <div class="stat-grid" v-if="summary">
      <div class="stat-card" style="border-color:var(--danger)">
        <div class="label">全年应收</div>
        <div class="value" style="color:var(--danger)">{{ money(summary.totalReceivable) }}</div>
      </div>
      <div class="stat-card" style="border-color:var(--success)">
        <div class="label">全年应付</div>
        <div class="value" style="color:var(--success)">{{ money(summary.totalPayable) }}</div>
      </div>
      <div class="stat-card" :style="{ borderColor: summary.totalProfit >= 0 ? '#7c3aed' : 'var(--danger)' }">
        <div class="label">全年利润</div>
        <div class="value" :style="{ color: summary.totalProfit >= 0 ? '#7c3aed' : 'var(--danger)' }">{{ money(summary.totalProfit) }}</div>
      </div>
      <div class="stat-card" :style="{ borderColor: summary.totalMarginRate >= 0 ? '#059669' : 'var(--danger)' }">
        <div class="label">平均毛利率</div>
        <div class="value" :style="{ color: summary.totalMarginRate >= 0 ? '#059669' : 'var(--danger)' }">{{ summary.totalMarginRate }}%</div>
      </div>
    </div>

    <!-- 利润对比（环比/同比） -->
    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">
        利润对比
        <el-button link type="primary" style="float:right" :loading="compareLoading" @click="loadCompare('mom')"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <div style="margin-bottom:12px">
        <el-radio-group v-model="compareType" size="small" @change="loadCompare">
          <el-radio-button value="mom">环比（本月 vs 上月）</el-radio-button>
          <el-radio-button value="yoy">同比（本月 vs 去年同月）</el-radio-button>
        </el-radio-group>
      </div>
      <div v-if="compare" class="compare-grid">
        <div class="compare-card">
          <div class="cmp-label">{{ compare.period.currentLabel }}</div>
          <div class="cmp-row"><span>应收</span><b>{{ money(compare.current.receivable) }}</b></div>
          <div class="cmp-row"><span>应付</span><b>{{ money(compare.current.payable) }}</b></div>
          <div class="cmp-row"><span>利润</span><b :class="compare.current.profit >= 0 ? 'profit' : 'loss'">{{ money(compare.current.profit) }}</b></div>
          <div class="cmp-row"><span>毛利率</span><b>{{ compare.current.marginRate }}%</b></div>
        </div>
        <div class="compare-card">
          <div class="cmp-label">{{ compare.period.previousLabel }}</div>
          <div class="cmp-row"><span>应收</span><b>{{ money(compare.previous.receivable) }}</b></div>
          <div class="cmp-row"><span>应付</span><b>{{ money(compare.previous.payable) }}</b></div>
          <div class="cmp-row"><span>利润</span><b :class="compare.previous.profit >= 0 ? 'profit' : 'loss'">{{ money(compare.previous.profit) }}</b></div>
          <div class="cmp-row"><span>毛利率</span><b>{{ compare.previous.marginRate }}%</b></div>
        </div>
        <div class="compare-card diff">
          <div class="cmp-label">差异</div>
          <div class="cmp-row"><span>应收</span><b :class="compare.diff.receivable >= 0 ? 'up' : 'down'">{{ compare.diff.receivable >= 0 ? '+' : '' }}{{ money(compare.diff.receivable) }}</b></div>
          <div class="cmp-row"><span>应付</span><b :class="compare.diff.payable >= 0 ? 'up' : 'down'">{{ compare.diff.payable >= 0 ? '+' : '' }}{{ money(compare.diff.payable) }}</b></div>
          <div class="cmp-row"><span>利润</span><b :class="compare.diff.profit >= 0 ? 'up' : 'down'">{{ compare.diff.profit >= 0 ? '+' : '' }}{{ money(compare.diff.profit) }}</b></div>
          <div class="cmp-row"><span>利润率变化</span><b :class="compare.diff.marginRate >= 0 ? 'up' : 'down'">{{ compare.diff.marginRate >= 0 ? '+' : '' }}{{ compare.diff.marginRate }}%</b></div>
        </div>
      </div>
      <el-empty v-if="!compare && !compareLoading" description="暂无数据" :image-size="50" />
    </div>

    <!-- 月度趋势 -->
    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">月度利润趋势（{{ year }}年）</div>
      <div ref="chartRef" style="width:100%;height:360px" v-loading="loading"></div>
    </div>

    <!-- 月份明细表 -->
    <div class="page-card" style="margin-bottom:16px">
      <div class="card-title">月份明细</div>
      <el-table :data="trend" size="small" stripe v-loading="loading" empty-text="暂无数据">
        <el-table-column label="月份" width="80">
          <template #default="{ row }">{{ row.month }}月</template>
        </el-table-column>
        <el-table-column label="应收" align="right" width="140">
          <template #default="{ row }">{{ money(row.receivable) }}</template>
        </el-table-column>
        <el-table-column label="应付" align="right" width="140">
          <template #default="{ row }">{{ money(row.payable) }}</template>
        </el-table-column>
        <el-table-column label="利润" align="right" width="140">
          <template #default="{ row }">
            <span :class="row.profit >= 0 ? 'profit' : 'loss'">{{ money(row.profit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="毛利率" align="right" width="100">
          <template #default="{ row }">
            <span :class="row.marginRate >= 0 ? 'profit' : 'loss'">{{ row.marginRate }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { financeTrendAPI, financeProfitCompareAPI } from '@/api/finance';
import { money } from '@/utils/dicts';

const year = ref(new Date().getFullYear());
const yearOptions = computed(() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => y - 4 + i);
});
const loading = ref(false);
const compareLoading = ref(false);
const trend = ref([]);
const compare = ref(null);
const compareType = ref('mom');
const chartRef = ref(null);

const summary = computed(() => {
  const t = trend.value;
  if (!t?.length) return null;
  const totalReceivable = t.reduce((s, m) => s + m.receivable, 0);
  const totalPayable = t.reduce((s, m) => s + m.payable, 0);
  const totalProfit = totalReceivable - totalPayable;
  const totalMarginRate = totalReceivable ? Number(((totalProfit / totalReceivable) * 100).toFixed(2)) : 0;
  return { totalReceivable, totalPayable, totalProfit, totalMarginRate };
});

async function loadTrend() {
  try {
    const d = await financeTrendAPI(year.value);
    trend.value = d || [];
    await nextTick();
    renderChart();
  } catch { trend.value = []; }
}

async function loadCompare(type) {
  compareType.value = type || compareType.value;
  compareLoading.value = true;
  try {
    const d = await financeProfitCompareAPI({ type: compareType.value });
    compare.value = d;
  } catch { compare.value = null; }
  compareLoading.value = false;
}

async function loadAll() {
  loading.value = true;
  await Promise.all([loadTrend(), loadCompare()]);
  loading.value = false;
}

function renderChart() {
  const el = chartRef.value;
  if (!el || !trend.value.length) return;
  el.innerHTML = '';
  const months = trend.value.map((m) => `${m.month}月`);
  const profits = trend.value.map((m) => m.profit);
  const rates = trend.value.map((m) => m.marginRate);
  const maxProfit = Math.max(...profits.map(Math.abs), 1);
  const maxRate = Math.max(...rates.map(Math.abs), 1);

  const W = el.clientWidth || 800;
  const H = 340;
  const pad = { top: 30, right: 80, bottom: 36, left: 60 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const bw = cw / months.length * 0.55;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // 网格线
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch * i) / 4;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', pad.left); line.setAttribute('y1', y);
    line.setAttribute('x2', W - pad.right); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#e5e7eb'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // 柱状图
  months.forEach((label, i) => {
    const x = pad.left + (cw / months.length) * i + (cw / months.length - bw) / 2;
    const h = (Math.abs(profits[i]) / maxProfit) * (ch / 2);
    const yBase = pad.top + ch / 2;
    const y = profits[i] >= 0 ? yBase - h : yBase;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', bw); rect.setAttribute('height', Math.max(h, 1));
    rect.setAttribute('fill', profits[i] >= 0 ? '#7c3aed' : '#ef4444');
    rect.setAttribute('rx', '2');
    svg.appendChild(rect);
  });

  // 毛利率折线
  const linePoints = rates.map((r, i) => {
    const x = pad.left + (cw / months.length) * i + cw / months.length / 2;
    const y = pad.top + ch / 2 - (r / Math.max(maxRate, 100)) * (ch / 2);
    return `${x},${y}`;
  });
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', linePoints.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#059669');
  polyline.setAttribute('stroke-width', '2.5');
  svg.appendChild(polyline);

  // 折线数据点
  rates.forEach((r, i) => {
    const x = pad.left + (cw / months.length) * i + cw / months.length / 2;
    const y = pad.top + ch / 2 - (r / Math.max(maxRate, 100)) * (ch / 2);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', '#059669');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);
    // 标签
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y - 10);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#059669');
    text.textContent = `${r}%`;
    svg.appendChild(text);
  });

  // X 轴标签
  months.forEach((label, i) => {
    const x = pad.left + (cw / months.length) * i + cw / months.length / 2;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', H - 8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '12');
    text.setAttribute('fill', '#6b7280');
    text.textContent = label;
    svg.appendChild(text);
  });

  // Y 轴标签（利润）
  for (let i = -2; i <= 2; i++) {
    const y = pad.top + ch / 2 - (i / 2) * (ch / 2);
    if (y < pad.top || y > H - pad.bottom) continue;
    const v = Math.round((i / 2) * maxProfit);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pad.left - 8); text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#6b7280');
    text.textContent = money(v);
    svg.appendChild(text);
  }

  // 图例
  const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legend.setAttribute('transform', `translate(${W - pad.right + 10}, ${pad.top})`);
  const items = [
    { color: '#7c3aed', label: '利润' },
    { color: '#059669', label: '毛利率' },
  ];
  items.forEach((item, i) => {
    const y = i * 22;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0'); rect.setAttribute('y', y);
    rect.setAttribute('width', '12'); rect.setAttribute('height', '12');
    rect.setAttribute('rx', '2'); rect.setAttribute('fill', item.color);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '18'); text.setAttribute('y', y + 10);
    text.setAttribute('font-size', '12'); text.setAttribute('fill', '#374151');
    text.textContent = item.label;
    legend.appendChild(rect); legend.appendChild(text);
  });
  svg.appendChild(legend);

  el.appendChild(svg);
}

onMounted(() => { loadAll(); });
</script>

<style scoped>
.compare-grid { display:flex; gap:16px; }
.compare-card { flex:1; background:#f9fafb; border-radius:8px; padding:14px; border:1px solid #e5e7eb; }
.compare-card.diff { background:#fefce8; border-color:#fde68a; }
.cmp-label { font-size:13px; font-weight:600; color:#374151; margin-bottom:10px; }
.cmp-row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
.cmp-row span { color:#6b7280; }
.cmp-row b { font-weight:600; }
.profit { color:#059669; }
.loss { color:#ef4444; }
.up { color:#059669; }
.down { color:#ef4444; }
@media(max-width:768px) { .compare-grid { flex-direction:column; } }
</style>