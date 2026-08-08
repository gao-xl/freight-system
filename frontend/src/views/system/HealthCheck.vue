<template>
  <div class="health-page">
    <div class="page-heading">
      <div class="title"><el-icon><Monitor /></el-icon>系统健康检查</div>
      <span class="page-desc">检查运行环境是否满足要求。全部通过后系统可正常运行。</span>
    </div>

    <div class="health-card page-card">
      <div class="health-head">
        <div>
          <div class="health-title">检查项</div>
          <div class="health-sub">节点 / 磁盘 / 端口 / 数据目录 / 数据库 / 迁移</div>
        </div>
        <el-button type="primary" :loading="loading" @click="run">
          <el-icon class="h-btn-icon"><Refresh /></el-icon>重新检查
        </el-button>
      </div>

      <!-- 加载中骨架屏 -->
      <div v-if="loading" v-loading="true" class="health-loading" element-loading-text="正在检查运行环境…" />

      <!-- 接口未就绪（联调等待态） -->
      <el-alert v-else-if="unavailable" type="info" :closable="false" show-icon class="health-unavail"
        title="健康检查接口暂不可用（后端联调中）。请稍后重试。" />

      <template v-else>
        <div v-for="c in checks" :key="c.item" class="health-item" :class="`is-${c.status}`">
          <el-icon class="h-status" :class="`s-${c.status}`">
            <CircleCheckFilled v-if="c.status === 'ok'" />
            <WarningFilled v-else-if="c.status === 'warn'" />
            <CircleCloseFilled v-else />
          </el-icon>
          <div class="h-body">
            <div class="h-item-name">{{ itemName(c.item) }}</div>
            <div class="h-detail num">{{ c.detail }}</div>
            <div v-if="c.fix && c.status !== 'ok'" class="h-fix">
              <el-tag :type="c.status === 'warn' ? 'warning' : 'danger'" size="small" effect="light">
                {{ c.status === 'warn' ? '警告' : '失败' }}
              </el-tag>
              <span class="h-fix-text">{{ c.fix }}</span>
              <el-button size="small" plain @click="copyFix(c.fix)">
                <el-icon class="h-btn-icon"><CopyDocument /></el-icon>复制修复命令
              </el-button>
            </div>
            <div v-else class="h-fix h-ok-line">
              <el-tag type="success" size="small" effect="light">通过</el-tag>
            </div>
          </div>
        </div>

        <!-- 汇总条 -->
        <div class="health-summary" :class="summaryClass">
          <el-icon><component :is="summaryIcon" /></el-icon>
          <span>{{ summaryText }}</span>
          <span v-if="warnCount" class="summary-count">警告 {{ warnCount }} 项</span>
          <span v-if="failCount" class="summary-count">失败 {{ failCount }} 项</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Monitor, Refresh, CircleCheckFilled, WarningFilled, CircleCloseFilled, CopyDocument, CircleCheck, Warning, CircleClose } from '@element-plus/icons-vue';
import { getSystemHealth } from '@/api/onboarding';
import { track } from '@/utils/track';

const checks = ref([]);
const loading = ref(false);
const unavailable = ref(false);

const ITEM_NAMES = {
  node: 'Node 版本', disk: '磁盘空间', port: '端口占用', dataDir: '数据目录', database: '数据库可达', migration: '迁移状态',
};
const itemName = (k) => ITEM_NAMES[k] || k;

const failCount = computed(() => checks.value.filter((c) => c.status === 'fail').length);
const warnCount = computed(() => checks.value.filter((c) => c.status === 'warn').length);
const okCount = computed(() => checks.value.filter((c) => c.status === 'ok').length);
const summaryClass = computed(() => (failCount.value ? 'is-fail' : warnCount.value ? 'is-warn' : 'is-ok'));
const summaryIcon = computed(() => (failCount.value ? CircleClose : warnCount.value ? Warning : CircleCheck));
const summaryText = computed(() => {
  if (failCount.value) return `${failCount.value} 项失败，请按指引修复`;
  if (warnCount.value) return `${warnCount.value} 项警告`;
  return '全部通过，系统可正常运行';
});

async function run() {
  loading.value = true;
  unavailable.value = false;
  try {
    const data = await getSystemHealth();
    checks.value = (data && data.checks) || [];
    track('health_check_run', { total: checks.value.length });
  } catch {
    unavailable.value = true;
    checks.value = [];
  } finally { loading.value = false; }
}

async function copyFix(fix) {
  try {
    await navigator.clipboard.writeText(fix);
    ElMessage.success('修复命令已复制');
    track('health_copy_fix');
  } catch { ElMessage.warning('复制失败，请手动复制'); }
}

onMounted(run);
</script>

<style scoped>
.health-page { max-width: 720px; margin: 0 auto; }
.page-desc { font-size: 13px; color: var(--text-muted); }
.health-card { padding: 20px 24px; }
.health-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.health-title { font-size: 18px; font-weight: 600; color: var(--text-main); }
.health-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.health-loading { min-height: 220px; }
.health-unavail { margin-bottom: 4px; }

.health-item {
  display: flex; gap: 12px; padding: 14px 0;
  border-top: 1px solid var(--border);
}
.h-status { font-size: 20px; margin-top: 2px; flex-shrink: 0; }
.s-ok { color: var(--health-ok); }
.s-warn { color: var(--health-warn); }
.s-fail { color: var(--health-fail); }
.h-body { flex: 1; min-width: 0; }
.h-item-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
.h-detail { font-size: 13px; color: var(--text-sub); margin-top: 4px; }
.h-fix { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.h-fix-text { font-size: 13px; color: var(--text-sub); line-height: 1.6; }
.h-ok-line { margin-top: 8px; }
.h-btn-icon { margin-right: 2px; }

.health-summary {
  display: flex; align-items: center; gap: 8px;
  margin-top: 18px; padding: 12px 16px; border-radius: var(--radius);
  font-size: 14px; font-weight: 500;
}
.health-summary.is-ok { background: var(--success-light); color: var(--health-ok); }
.health-summary.is-warn { background: var(--warning-light); color: var(--health-warn); }
.health-summary.is-fail { background: var(--danger-light); color: var(--health-fail); }
.summary-count { margin-left: auto; font-size: 12px; font-weight: 400; }

@media (max-width: 768px) {
  .health-head { flex-direction: column; }
  .health-card { padding: 14px 16px; }
}
</style>
