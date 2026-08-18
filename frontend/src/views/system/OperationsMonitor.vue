<template>
  <div class="page-card ops-monitor">
    <div class="topbar">
      <div class="left">
        <h3 class="title">运维监控</h3>
        <el-tag size="small" type="success" v-if="live">实时 · 每 15s 刷新</el-tag>
        <el-tag size="small" type="info" v-else>已暂停</el-tag>
      </div>
      <div class="right">
        <el-switch v-model="live" active-text="自动刷新" @change="onMode" />
        <el-button :loading="refreshing" @click="load">刷新</el-button>
        <el-button type="warning" :loading="escalating" @click="runEscalate">扫描流程节点超时</el-button>
      </div>
    </div>

    <!-- 指标卡片 -->
    <div class="stat-grid" v-if="meta">
      <div class="stat-card"><div class="label">运行时长</div><div class="value">{{ uptime }}</div></div>
      <div class="stat-card"><div class="label">实时 QPS</div><div class="value">{{ n2(meta.rates.qps) }}</div></div>
      <div class="stat-card" :class="risk(meta.rates.errorRate5xx, 5, true)"><div class="label">5xx 错误率</div><div class="value">{{ meta.rates.errorRate5xx }}%</div></div>
      <div class="stat-card" :class="risk(meta.process.eventLoopLagMs, 200, false)"><div class="label">事件循环延迟</div><div class="value">{{ meta.process.eventLoopLagMs }}<small>ms</small></div></div>
      <div class="stat-card" :class="risk(meta.db.usedPct, 90, false)"><div class="label">DB 连接池使用</div><div class="value">{{ meta.db.usedPct }}%</div></div>
      <div class="stat-card"><div class="label">缓存命中率</div><div class="value">{{ meta.cache ? meta.cache.hitRate : '-' }}<small>%</small></div></div>
      <div class="stat-card"><div class="label">在途预警</div><div class="value" :style="{ color: meta.alerts.active ? 'var(--warning)' : 'var(--brand)' }">{{ meta.alerts.active }}</div></div>
    </div>

    <!-- 触发中的告警 -->
    <div v-if="firing.length" class="firing-panel">
      <div class="firing-head"><el-icon color="#f56c6c"><Warning /></el-icon>触发中的告警（{{ firing.length }}）</div>
      <div v-for="f in firing" :key="f.key" class="firing-item">
        <el-tag :type="f.level === 'danger' ? 'danger' : 'warning'" size="small">{{ f.title }}</el-tag>
        <span class="sub">当前 {{ f.current }}{{ f.unit }}，阈值 {{ f.value }}{{ f.unit }}</span>
      </div>
    </div>

    <!-- 运行时指标详情 -->
    <el-row :gutter="16" class="block-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="inner-card">
          <template #header>运行时指标</template>
          <div class="gauge-row" v-if="meta">
            <div class="gauge-label">P50 延迟 <b>{{ n3(meta.latency.p50) }}s</b></div>
            <div class="gauge-track"><div class="gauge-fill warn" :style="{ width: pct(meta.latency.p50 / 2 * 100) }"></div></div>
            <div class="gauge-label">P95 延迟 <b>{{ n3(meta.latency.p95) }}s</b></div>
            <div class="gauge-track"><div class="gauge-fill" :style="{ width: pct(meta.latency.p95 / 2 * 100) }"></div></div>
            <div class="gauge-label">DB 连接池使用 <b>{{ meta.db.usedPct }}%</b> <span class="mini">({{ meta.db.used }}/{{ meta.db.maxTotal }})</span></div>
            <div class="gauge-track"><div class="gauge-fill" :style="{ width: meta.db.usedPct + '%' }"></div></div>
            <div class="gauge-label">缓存命中率 <b>{{ meta.cache ? meta.cache.hitRate : '-' }}%</b></div>
            <div class="gauge-track"><div class="gauge-fill" :style="{ width: (meta.cache ? meta.cache.hitRate : 0) + '%' }"></div></div>
            <div class="kv">
              <span>DB 连通延迟</span><b>{{ meta.db.pingMs != null ? meta.db.pingMs + 'ms' : '-' }}</b>
              <span>内存 RSS</span><b>{{ meta.process.rssMB }}MB</b>
              <span>堆内存</span><b>{{ meta.process.heapMB }}MB</b>
              <span>Node</span><b>{{ meta.process.nodeVersion }}</b>
              <span>近 60s 请求</span><b>{{ meta.rates.windowRequests }}</b>
              <span>缓存模式</span><b>{{ (meta.cache && meta.cache.mode) || '-' }}</b>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="inner-card">
          <template #header>
            <div class="card-head"><span>告警规则</span><el-button link type="primary" @click="save">保存规则</el-button></div>
          </template>
          <el-table :data="rules" size="small" border row-key="key">
            <el-table-column label="规则" min-width="150">
              <template #default="{ row }"><span :title="row.message">{{ row.title }}</span></template>
            </el-table-column>
            <el-table-column label="启用" width="60" align="center">
              <template #default="{ row }"><el-switch v-model="row.enabled" size="small" /></template>
            </el-table-column>
            <el-table-column label="阈值" width="90">
              <template #default="{ row }">
                <el-input-number v-model="row.value" :min="0" :max="row.key === 'error_rate_5xx' || row.key === 'db_pool_peak' ? 100 : 100000" size="small" controls-position="right" />
              </template>
            </el-table-column>
            <el-table-column label="当前" width="70" align="right">
              <template #default="{ row }"><span :class="{ 'fire-badge': row.firing }">{{ row.current != null ? row.current : '-' }}<small>{{ row.unit }}</small></span></template>
            </el-table-column>
            <el-table-column label="等级" width="70">
              <template #default="{ row }">
                <el-tag :type="row.level === 'danger' ? 'danger' : 'warning'" size="small">{{ row.level === 'danger' ? '严重' : '警告' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Warning } from '@element-plus/icons-vue';
import { monitorAPI } from '@/api/monitor';

const meta = ref(null);
const rules = ref([]);
const firing = ref([]);
const refreshing = ref(false);
const escalating = ref(false);
const live = ref(true);
let timer = null;

const uptime = computed(() => {
  if (!meta.value) return '-';
  const s = meta.value.uptimeSec;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}天 ${h}时 ${m}分`;
});

function n2(v) { return v == null ? '-' : Math.round(v * 100) / 100; }
function n3(v) { return v == null ? '-' : +Number(v).toFixed(2); }
function pct(v) { const x = Math.max(0, Math.min(100, v)); return x + '%'; }
function risk(v, th, isRate) {
  const n = Number(v) || 0;
  if (isRate) { if (n >= th) return 'bad'; if (n > 0) return 'warn'; return 'ok'; }
  return n >= th ? 'bad' : (n >= th * 0.6 ? 'warn' : 'ok');
}

async function load() {
  refreshing.value = true;
  try {
    const res = await monitorAPI.snapshot();
    meta.value = res.data;
    rules.value = res.rules || [];
    firing.value = res.firing || [];
  } catch (e) { /* 错误已由拦截器提示 */ } finally { refreshing.value = false; }
}

async function save() {
  await monitorAPI.saveRules(rules.value.map(({ key, enabled, value }) => ({ key, enabled, value })));
  ElMessage.success('告警规则已保存');
  load();
}

async function runEscalate() {
  escalating.value = true;
  try {
    const r = await monitorAPI.runEscalate();
    ElMessage.success(`升级扫描完成：升级 ${r.escalated} 条，结案 ${r.resolved} 条`);
    load();
  } finally { escalating.value = false; }
}

function onMode() {
  if (timer) { clearInterval(timer); timer = null; }
  if (live.value) { timer = setInterval(load, 15000); load(); }
}

onMounted(() => { load(); timer = setInterval(load, 15000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.title { margin: 0; font-size: 18px; }
.right { display: flex; gap: 8px; align-items: center; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 8px; }
.stat-card { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; border-left: 3px solid var(--brand); }
.stat-card.warn { border-left-color: var(--warning); }
.stat-card.bad { border-left-color: var(--danger); }
.stat-card.ok { border-left-color: var(--success); }
.label { font-size: 12px; color: var(--text-sub); }
.value { font-size: 22px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
.value small { font-size: 12px; color: var(--text-sub); font-weight: 400; margin-left: 2px; }
.firing-panel { border: 1px solid #fde2e0; background: #fef4f3; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
.firing-head { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--danger); margin-bottom: 8px; }
.firing-item { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.firing-item .sub { font-size: 12px; color: var(--text-sub); }
.block-row { margin-top: 4px; }
.inner-card { margin-bottom: 12px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.gauge-row { display: flex; flex-direction: column; gap: 6px; }
.gauge-label { display: flex; align-items: baseline; gap: 6px; font-size: 13px; margin-top: 4px; }
.gauge-label b { color: var(--text); }
.gauge-label .mini { color: var(--text-sub); font-size: 12px; }
.gauge-track { height: 8px; background: var(--fill); border-radius: 4px; overflow: hidden; }
.gauge-fill { height: 100%; background: linear-gradient(90deg, #409eff, #79bbff); border-radius: 4px; transition: width .4s; }
.gauge-fill.warn { background: linear-gradient(90deg, #e6a23c, #f3c98b); }
.kv { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin-top: 14px; font-size: 13px; }
.kv span { color: var(--text-sub); }
.kv b { font-variant-numeric: tabular-nums; }
.fire-badge { color: var(--danger); font-weight: 700; }
</style>