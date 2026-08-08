<template>
  <div class="todo-page">
    <!-- 页面标题 -->
    <div class="page-heading">
      <div class="title"><el-icon><Memo /></el-icon>待办工作台</div>
      <span class="today">{{ todayText }}</span>
    </div>

    <!-- 汇总卡片 -->
    <div class="summary-row">
      <div class="sum-card total" @click="filter = 'all'">
        <div class="sum-num">{{ data.total || 0 }}</div>
        <div class="sum-label">今日待办</div>
        <div class="sum-arrow"><el-icon><Right /></el-icon></div>
      </div>
      <div class="sum-card high" @click="filter = 'high'">
        <div class="sum-num">{{ (data.summary && data.summary.high) || 0 }}</div>
        <div class="sum-label">高优先级</div>
      </div>
      <div class="sum-card medium" @click="filter = 'medium'">
        <div class="sum-num">{{ (data.summary && data.summary.medium) || 0 }}</div>
        <div class="sum-label">中优先级</div>
      </div>
      <div class="sum-card low" @click="filter = 'low'">
        <div class="sum-num">{{ (data.summary && data.summary.low) || 0 }}</div>
        <div class="sum-label">低优先级</div>
      </div>
      <div class="sum-card role">
        <div class="sum-role">{{ roleText }}</div>
        <div class="sum-label">当前角色</div>
      </div>
    </div>

    <!-- 筛选项 -->
    <div class="toolbar">
      <div class="tb-left">
        <el-radio-group v-model="filter" @change="applyFilter">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="high">高</el-radio-button>
          <el-radio-button value="medium">中</el-radio-button>
          <el-radio-button value="low">低</el-radio-button>
        </el-radio-group>
      </div>
      <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <!-- 待办卡片列表 -->
    <div v-loading="loading" class="content">
      <el-empty v-if="!filteredList.length" description="暂无待办，一切就绪" />
      <div class="card-grid">
        <div v-for="(it, idx) in filteredList" :key="idx" class="todo-card" :class="'p-' + it.priority" @click="go(it)">
          <div class="card-head">
            <span class="prio-dot" :class="'dot-' + it.priority"></span>
            <el-tag size="small" :type="prioTag(it.priority)" effect="light">{{ prioText(it.priority) }}</el-tag>
            <el-tag size="small" effect="plain" type="info">{{ typeText(it.type) }}</el-tag>
          </div>
          <div class="card-title">{{ it.title }}</div>
          <div class="card-msg">{{ it.message }}</div>
          <div class="card-foot">
            <span v-if="it.dueAt" class="due"><el-icon class="due-icon"><Clock /></el-icon>{{ fmt(it.dueAt) }}</span>
            <el-link v-if="it.orderId && it.link" type="primary" :underline="false" class="go-link">
              查看详情 <el-icon><Right /></el-icon>
            </el-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { todoAPI } from '@/api';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const filter = ref('all');
const data = reactive({ role: '', total: 0, summary: {}, items: [] });

const roleText = computed(() => ({ admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读' }[data.role] || data.role));

const todayText = computed(() => {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${week}`;
});

const filteredList = computed(() => {
  if (filter.value === 'all') return data.items;
  return data.items.filter((it) => it.priority === filter.value);
});

function prioTag(p) { return { high: 'danger', medium: 'warning', low: 'info' }[p] || 'info'; }
function prioText(p) { return { high: '高', medium: '中', low: '低' }[p] || p; }
function typeText(t) {
  return {
    alert: '预警', booking: '待订舱', customs: '待报关', overdue_receivable: '超期应收',
    cutoff: '临期截港', customer_follow: '客户跟进', qingdao_blocked: '青岛港卡点',
  }[t] || t;
}
function fmt(v) { return v ? String(v).replace('T', ' ').slice(0, 16) : '-'; }

async function load() {
  loading.value = true;
  try {
    const d = await todoAPI();
    data.role = d.role;
    data.total = d.total;
    data.summary = d.summary || {};
    data.items = d.items || [];
  } finally { loading.value = false; }
}

function go(it) {
  if (it.link) {
    const p = it.link.replace(/^#/, '');
    router.push(p);
  }
}

function applyFilter() { /* 由 computed 驱动 */ }

// U9：SSE 落地前，60s 轮询保持待办新鲜（页面隐藏时暂停）
let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!document.hidden) load();
  }, 60000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

onMounted(() => { document.title = (auth.displayName || '') + ' 的待办 - 货运代理管理系统'; load(); startPolling(); });
onUnmounted(() => stopPolling());
</script>

<style scoped>
.todo-page { display: flex; flex-direction: column; gap: 16px; }
.today { font-size: 13px; color: var(--text-muted); }

.summary-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
.sum-card {
  background: #fff; border-radius: var(--radius-lg);
  padding: 18px 20px; cursor: pointer;
  border: 1px solid var(--border);
  position: relative; overflow: hidden;
  transition: transform .18s, box-shadow .18s;
}
.sum-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.sum-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  border-radius: 0 4px 4px 0;
}
.sum-card.total::before { background: var(--brand); }
.sum-card.high::before { background: #f56c6c; }
.sum-card.medium::before { background: #e6a23c; }
.sum-card.low::before { background: #c0c4cc; }
.sum-card.role::before { background: #67c23a; }
.sum-num { font-size: 32px; font-weight: 700; line-height: 1.1; font-family: var(--font-num); }
.sum-label { margin-top: 6px; font-size: 13px; color: var(--text-sub); }
.sum-arrow {
  position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  color: var(--border-strong); font-size: 18px;
  transition: transform .18s;
}
.sum-card:hover .sum-arrow { transform: translateY(-50%) translateX(3px); color: var(--brand); }
.sum-card.total .sum-num { color: var(--brand); }
.sum-card.high .sum-num { color: #f56c6c; }
.sum-card.medium .sum-num { color: #e6a23c; }
.sum-card.low .sum-num { color: #909399; }
.sum-role { font-size: 24px; font-weight: 700; color: #67c23a; line-height: 1.1; }

.toolbar { display: flex; align-items: center; justify-content: space-between; }
.tb-left { display: flex; align-items: center; }
.content { min-height: 200px; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.todo-card {
  background: #fff; border-radius: var(--radius-lg);
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-left: 4px solid #c0c4cc;
  cursor: pointer;
  transition: transform .18s, box-shadow .18s, border-color .18s;
}
.todo-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.todo-card.p-high { border-left-color: #f56c6c; }
.todo-card.p-medium { border-left-color: #e6a23c; }
.todo-card.p-low { border-left-color: #c0c4cc; }

.card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.prio-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-high { background: #f56c6c; box-shadow: 0 0 0 3px rgba(245,108,108,.15); }
.dot-medium { background: #e6a23c; box-shadow: 0 0 0 3px rgba(230,162,60,.15); }
.dot-low { background: #c0c4cc; }

.card-title { font-size: 15px; font-weight: 600; color: var(--text-main); }
.card-msg {
  margin-top: 6px; font-size: 13px; color: var(--text-sub);
  min-height: 36px; line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-foot { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; }
.due {
  font-size: 12px; color: #e6a23c;
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--warning-light); padding: 2px 8px; border-radius: 6px;
}
.due-icon { font-size: 13px; }
.go-link { font-weight: 500; }

/* 卡片渐次浮现 */
.summary-row { animation: fadeUp .3s ease both; }
.card-grid { animation: fadeUp .42s ease both; }

/* 窄屏适配：汇总卡自动换列 */
@media (max-width: 768px) {
  .summary-row { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .sum-num { font-size: 26px; }
  .sum-role { font-size: 20px; }
  .toolbar { flex-wrap: wrap; gap: 8px; }
}
</style>