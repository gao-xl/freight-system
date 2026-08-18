<template>
  <div class="subs">
    <div class="subs-head">
      <div class="subs-title">通知订阅</div>
      <div class="subs-desc">选择您希望通过邮件/微信接收的通知类型，勾选即订阅，保存后生效。</div>
    </div>

    <div v-loading="loading" class="subs-list">
      <div v-for="cat in matrix" :key="cat.category" class="subs-card">
        <div class="subs-cat">
          <div class="subs-cat-name">{{ catLabel(cat.category) }}</div>
          <el-switch :model-value="masterState(cat)" @change="toggleMaster(cat, $event)" />
        </div>
        <div class="subs-channels">
          <div v-for="ch in cat.channels" :key="ch.channel" class="subs-row">
            <div class="subs-row-info">
              <div class="subs-row-label">{{ channelLabel(ch.channel) }}</div>
              <div class="subs-row-sub">{{ channelHint(ch.channel) }}</div>
            </div>
            <div class="subs-row-control">
              <template v-if="ch.channel === 'email'">
                <el-input v-model="emails[cat.category]" size="small" placeholder="收件邮箱" clearable
                  :disabled="!ch.enabled" style="width:min(260px,100%)" />
              </template>
              <el-switch v-model="ch.enabled" @change="syncMaster(cat)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && !matrix.length" description="暂无通知订阅项" />

    <div class="subs-foot">
      <el-button type="primary" :loading="saving" @click="save">保存订阅偏好</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { portalAPI } from '@/api';

const CATEGORIES = [
  { key: 'order', label: '订单通知', hint: '订单创建 / 状态变更' },
  { key: 'track', label: '跟踪动态', hint: '订舱装船 / 货物运输动态' },
  { key: 'bill', label: '账单通知', hint: '新增应收账单 / 账单更新' },
  { key: 'customs', label: '报关进度', hint: '报关申报 / 状态更新' },
];

const loading = ref(false);
const saving = ref(false);
const matrix = ref([]);
const emails = reactive({});

function catLabel(key) { return CATEGORIES.find((c) => c.key === key)?.label || key; }
function channelLabel(ch) { return ch === 'email' ? '邮件' : '微信公众号'; }
function channelHint(ch) { return ch === 'email' ? '发送到下方邮箱或客户档案邮箱' : '发送到已绑定的微信公众号'; }

// 全类目主开关状态：任一条目启用即为开
function masterState(cat) { return cat.channels.some((c) => c.enabled); }
function toggleMaster(cat, on) {
  for (const c of cat.channels) c.enabled = on;
}
function syncMaster(cat) { /* 主开关由 masterState 派生，无需额外处理 */ }

async function load() {
  loading.value = true;
  try {
    const d = await portalAPI.subscriptions();
    matrix.value = (d.matrix || []).map((cat) => ({
      category: cat.category,
      channels: (cat.channels || []).map((c) => ({ channel: c.channel, enabled: !!c.enabled })),
    }));
    (d.matrix || []).forEach((cat) => {
      const sub = cat.channels.find((c) => c.channel === 'email');
      emails[cat.category] = sub?.email || cat.defaultEmail || '';
    });
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载订阅偏好失败');
  } finally { loading.value = false; }
}

async function save() {
  const items = [];
  for (const cat of matrix.value) {
    for (const ch of cat.channels) {
      items.push({
        category: cat.category,
        channel: ch.channel,
        enabled: ch.enabled,
        email: ch.channel === 'email' ? (emails[cat.category] || '') : undefined,
      });
    }
  }
  saving.value = true;
  try {
    await portalAPI.saveSubscriptions(items);
    ElMessage.success('订阅偏好已保存');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败');
  } finally { saving.value = false; }
}

load();
</script>

<style scoped>
.subs { display: flex; flex-direction: column; gap: 16px; }
.subs-head { display: flex; flex-direction: column; gap: 4px; }
.subs-title { font-size: 17px; font-weight: 700; }
.subs-desc { color: var(--text-sub); font-size: 13px; }
.subs-list { display: flex; flex-direction: column; gap: 12px; }
.subs-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.subs-cat { display: flex; justify-content: space-between; align-items: center; }
.subs-cat-name { font-weight: 700; font-size: 15px; }
.subs-channels { display: flex; flex-direction: column; gap: 10px; }
.subs-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.subs-row-info { min-width: 0; }
.subs-row-label { font-size: 14px; }
.subs-row-sub { color: var(--text-sub); font-size: 12px; }
.subs-row-control { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.subs-foot { display: flex; justify-content: flex-end; }
@media (max-width: 480px) {
  .subs-row { align-items: flex-start; }
  .subs-row-control { width: 100%; justify-content: space-between; }
}
</style>