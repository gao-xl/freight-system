<template>
  <div class="page-card">
    <div class="table-topbar">
      <div class="left">
        <el-radio-group v-model="query.unread" @change="load(1)">
          <el-radio-button :value="''">全部</el-radio-button>
          <el-radio-button value="1">未读</el-radio-button>
        </el-radio-group>
        <el-select v-model="query.type" placeholder="分类" clearable style="width:120px" @change="load(1)">
          <el-option label="预警" value="alert" />
          <el-option label="订单" value="order" />
          <el-option label="财务" value="finance" />
          <el-option label="审批" value="approval" />
          <el-option label="系统" value="system" />
        </el-select>
        <el-button type="primary" @click="load(1)"><el-icon><Search /></el-icon>查询</el-button>
        <el-button :disabled="!unreadCount" @click="readAll"><el-icon><Select /></el-icon>全部已读</el-button>
        <el-button @click="openPrefs"><el-icon><Setting /></el-icon>订阅偏好</el-button>
      </div>
      <div class="stats">
        <el-tag type="danger">未读 {{ unreadCount }}</el-tag>
        <el-tag type="info">共 {{ total }}</el-tag>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="级别" width="80">
        <template #default="{ row }"><el-tag :type="levelType(row.level)" size="small">{{ levelText(row.level) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="分类" width="90">
        <template #default="{ row }">{{ typeText(row.type) }}</template>
      </el-table-column>
      <el-table-column label="内容" min-width="360">
        <template #default="{ row }">
          <div class="msg-title" :class="{ unread: !row.isRead }">
            {{ row.title }}
            <el-tag v-if="!row.isRead" size="small" type="danger" effect="plain">新</el-tag>
          </div>
          <div v-if="row.content" class="msg-content">{{ row.content }}</div>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.isRead" link type="primary" @click="markRead(row)">标记已读</el-button>
          <el-button v-if="row.refId" link type="success" @click="goRef(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination background layout="total, prev, pager, next, sizes" :total="total"
        v-model:current-page="query.page" v-model:page-size="query.pageSize" :page-sizes="[10, 20, 50]"
        @current-change="load()" @size-change="load(1)" />
    </div>

    <!-- F6 订阅偏好设置 -->
    <el-dialog v-model="prefVisible" title="消息订阅偏好" width="440">
      <p class="pref-tip">关闭的分类将不再生成站内消息，并停止对应的实时提醒。</p>
      <div class="pref-list">
        <div v-for="c in prefOptions" :key="c.value" class="pref-item">
          <el-checkbox v-model="prefs[c.value]">{{ c.label }}</el-checkbox>
          <span class="pref-desc">{{ c.desc }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="prefVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPrefs" @click="savePrefs">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { messageAPI } from '@/api';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const unreadCount = ref(0);
const query = reactive({ page: 1, pageSize: 15, unread: '', type: '' });
const prefVisible = ref(false);
const savingPrefs = ref(false);
const prefs = reactive({ alert: true, order: true, finance: true, approval: true, system: true });
const prefOptions = [
  { value: 'alert', label: '预警', desc: '船期变更、预警触发与解除' },
  { value: 'order', label: '订单', desc: '订单创建、状态变更、订舱装船' },
  { value: 'finance', label: '财务', desc: '财务记录新增、开票' },
  { value: 'approval', label: '审批', desc: '审批待办与结果' },
  { value: 'system', label: '系统', desc: '系统通知与运维告警' },
];

function levelType(l) { return l === 'danger' ? 'danger' : l === 'warning' ? 'warning' : 'info'; }
function levelText(l) { return { danger: '危险', warning: '警告', info: '提示' }[l] || l; }
function typeText(t) { return { alert: '预警', order: '订单', finance: '财务', approval: '审批', system: '系统' }[t] || t; }
function fmt(v) { return v ? String(v).replace('T', ' ').slice(0, 16) : '-'; }

async function loadUnread() {
  try { unreadCount.value = (await messageAPI.unreadCount()).count || 0; } catch { /* ignore */ }
}

async function load(page) {
  if (page) query.page = page;
  loading.value = true;
  try {
    const data = await messageAPI.list(query);
    list.value = data.list;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function markRead(row) {
  await messageAPI.read(row.id);
  row.isRead = true;
  loadUnread();
}

async function readAll() {
  const r = await messageAPI.readAll();
  ElMessage.success(r.message || '已全部标记为已读');
  loadUnread();
  load();
}

function goRef(row) {
  if (row.refType === 'order' && row.refId) { router.push(`/orders/${row.refId}`); return; }
  if (row.refType === 'alert' && row.refId) { router.push('/alerts'); return; }
  if ((row.refType === 'finance' || row.type === 'finance')) { router.push('/finance'); return; }
}

// 订阅偏好：打开时拉取当前偏好
async function openPrefs() {
  prefVisible.value = true;
  try {
    const { prefs: p } = await messageAPI.getPrefs();
    for (const c of prefOptions) prefs[c.value] = !!p[c.value];
  } catch { /* 保持默认全开 */ }
}

async function savePrefs() {
  savingPrefs.value = true;
  try {
    await messageAPI.updatePrefs({ ...prefs });
    ElMessage.success('订阅偏好已保存');
    prefVisible.value = false;
    loadUnread();
    load(1);
  } finally { savingPrefs.value = false; }
}

onMounted(() => { loadUnread(); load(1); });
</script>

<style scoped>
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.left { display: flex; gap: 10px; align-items: center; }
.stats { display: flex; gap: 8px; }
.msg-title { font-weight: 500; display: flex; align-items: center; gap: 6px; }
.msg-title.unread { color: var(--brand); font-weight: 600; }
.msg-content { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
.pref-tip { color: var(--text-muted); font-size: 13px; margin: 0 0 14px; }
.pref-list { display: flex; flex-direction: column; gap: 12px; }
.pref-item { display: flex; align-items: center; gap: 10px; }
.pref-desc { color: var(--text-muted); font-size: 12px; }
</style>