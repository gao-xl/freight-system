<template>
  <div class="todo-page">
    <!-- 汇总卡片 -->
    <div class="summary-row">
      <div class="sum-card total" @click="filter = 'all'">
        <div class="sum-num">{{ data.total || 0 }}</div>
        <div class="sum-label">今日待办</div>
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
      <el-radio-group v-model="filter" @change="applyFilter">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="high">高</el-radio-button>
        <el-radio-button value="medium">中</el-radio-button>
        <el-radio-button value="low">低</el-radio-button>
      </el-radio-group>
      <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <!-- 待办卡片列表 -->
    <div v-loading="loading" class="content">
      <el-empty v-if="!filteredList.length" description="暂无待办，一切就绪 🎉" />
      <div class="card-grid">
        <div v-for="(it, idx) in filteredList" :key="idx" class="todo-card" :class="'p-' + it.priority" @click="go(it)">
          <div class="card-head">
            <el-tag size="small" :type="prioTag(it.priority)">{{ prioText(it.priority) }}</el-tag>
            <el-tag size="small" effect="plain" type="info">{{ typeText(it.type) }}</el-tag>
          </div>
          <div class="card-title">{{ it.title }}</div>
          <div class="card-msg">{{ it.message }}</div>
          <div class="card-foot">
            <span v-if="it.dueAt" class="due">⏰ {{ fmt(it.dueAt) }}</span>
            <el-link v-if="it.orderId && it.link" type="primary" :underline="false">
              查看详情 <el-icon><Right /></el-icon>
            </el-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { todoAPI } from '@/api';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const filter = ref('all');
const data = reactive({ role: '', total: 0, summary: {}, items: [] });

const roleText = computed(() => ({ admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读' }[data.role] || data.role));

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

onMounted(() => { document.title = (auth.displayName || '') + ' 的待办 - 货运代理管理系统'; load(); });
</script>

<style scoped>
.todo-page { display: flex; flex-direction: column; gap: 16px; }
.summary-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
.sum-card { background: #fff; border-radius: 10px; padding: 18px 20px; cursor: pointer; border: 1px solid var(--border); transition: transform .15s, box-shadow .15s; }
.sum-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(18, 35, 63, .08); }
.sum-num { font-size: 30px; font-weight: 700; line-height: 1.1; }
.sum-label { margin-top: 6px; font-size: 13px; color: var(--text-sub); }
.sum-card.total .sum-num { color: var(--brand); }
.sum-card.high .sum-num { color: #f56c6c; }
.sum-card.medium .sum-num { color: #e6a23c; }
.sum-card.low .sum-num { color: #909399; }
.sum-role { font-size: 22px; font-weight: 700; color: #67c23a; line-height: 1.1; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.content { min-height: 200px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.todo-card { background: #fff; border-radius: 10px; padding: 16px; border: 1px solid var(--border); border-left: 4px solid #909399; cursor: pointer; transition: box-shadow .15s; }
.todo-card:hover { box-shadow: 0 6px 18px rgba(18, 35, 63, .10); }
.todo-card.p-high { border-left-color: #f56c6c; }
.todo-card.p-medium { border-left-color: #e6a23c; }
.todo-card.p-low { border-left-color: #909399; }
.card-head { display: flex; gap: 6px; margin-bottom: 8px; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text-main); }
.card-msg { margin-top: 6px; font-size: 13px; color: var(--text-sub); min-height: 36px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-foot { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
.due { font-size: 12px; color: #e6a23c; }
</style>