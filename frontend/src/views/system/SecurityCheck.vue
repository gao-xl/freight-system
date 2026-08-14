<template>
  <div class="security-page">
    <div class="page-heading">
      <div class="title"><el-icon><Lock /></el-icon>系统安全检测</div>
      <span class="page-desc">检查系统安全配置是否存在暴露面与风险。及时发现端口暴露、弱密钥、防火墙缺失等隐患。</span>
    </div>

    <div class="security-card page-card">
      <div class="security-head">
        <div>
          <div class="security-title">安全检测项</div>
          <div class="security-sub">监听暴露 / 反代覆盖 / 数据库端口 / 防火墙 / JWT 密钥 / 登录锁定 / 强制改密 / HTTPS / 数据库认证 / 默认管理员</div>
        </div>
        <el-button type="primary" :loading="loading" @click="run">
          <el-icon class="s-btn-icon"><Refresh /></el-icon>重新检测
        </el-button>
      </div>

      <!-- 加载中骨架屏 -->
      <div v-if="loading" v-loading="true" class="security-loading" element-loading-text="正在执行安全检测…" />

      <!-- 接口未就绪 -->
      <el-alert v-else-if="unavailable" type="info" :closable="false" show-icon class="security-unavail"
        title="安全检测接口暂不可用（后端联调中）。请稍后重试。" />

      <template v-else>
        <div v-for="c in checks" :key="c.item" class="security-item" :class="`is-${c.status}`">
          <el-icon class="s-status" :class="`s-${c.status}`">
            <CircleCheckFilled v-if="c.status === 'ok'" />
            <WarningFilled v-else-if="c.status === 'warn'" />
            <CircleCloseFilled v-else-if="c.status === 'fail'" />
            <InfoFilled v-else />
          </el-icon>
          <div class="s-body">
            <div class="s-item-name">{{ itemName(c.item) }}</div>
            <div class="s-detail num">{{ c.detail }}</div>
            <div v-if="c.fix && c.status !== 'ok'" class="s-fix">
              <el-tag :type="c.status === 'warn' ? 'warning' : 'danger'" size="small" effect="light">
                {{ c.status === 'warn' ? '警告' : '风险' }}
              </el-tag>
              <span class="s-fix-text">{{ c.fix }}</span>
              <el-button size="small" plain @click="copyFix(c.fix)">
                <el-icon class="s-btn-icon"><CopyDocument /></el-icon>复制建议
              </el-button>
            </div>
            <div v-else class="s-fix s-ok-line">
              <el-tag type="success" size="small" effect="light">通过</el-tag>
            </div>
          </div>
        </div>

        <!-- 汇总条 -->
        <div class="security-summary" :class="summaryClass">
          <el-icon><component :is="summaryIcon" /></el-icon>
          <span>{{ summaryText }}</span>
          <span v-if="warnCount" class="summary-count">警告 {{ warnCount }} 项</span>
          <span v-if="failCount" class="summary-count">风险 {{ failCount }} 项</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Lock, Refresh, CircleCheckFilled, WarningFilled, CircleCloseFilled, InfoFilled, CopyDocument, CircleCheck, Warning, CircleClose } from '@element-plus/icons-vue';
import { runSecurityCheck } from '@/api/security';
import { track } from '@/utils/track';

const checks = ref([]);
const loading = ref(false);
const unavailable = ref(false);

const ITEM_NAMES = {
  listening: '后端监听', proxy: '反向代理覆盖', dbExposure: '数据库端口暴露', firewall: '防火墙',
  jwtSecret: 'JWT 密钥强度', loginLock: '登录锁定', forcePassword: '强制改密', https: 'HTTPS',
  dbAuth: '数据库认证', adminDefault: '默认管理员',
};
const itemName = (k) => ITEM_NAMES[k] || k;

const failCount = computed(() => checks.value.filter((c) => c.status === 'fail').length);
const warnCount = computed(() => checks.value.filter((c) => c.status === 'warn').length);
const summaryClass = computed(() => (failCount.value ? 'is-fail' : warnCount.value ? 'is-warn' : 'is-ok'));
const summaryIcon = computed(() => (failCount.value ? CircleClose : warnCount.value ? Warning : CircleCheck));
const summaryText = computed(() => {
  if (failCount.value) return `${failCount.value} 项风险，请按建议处理`;
  if (warnCount.value) return `${warnCount.value} 项警告，建议关注`;
  return '安全配置检查通过';
});

async function run() {
  loading.value = true;
  unavailable.value = false;
  try {
    const data = await runSecurityCheck();
    checks.value = (data && data.checks) || [];
    track('security_check_run', { total: checks.value.length });
  } catch {
    unavailable.value = true;
    checks.value = [];
  } finally { loading.value = false; }
}

async function copyFix(fix) {
  try {
    await navigator.clipboard.writeText(fix);
    ElMessage.success('修复建议已复制');
    track('security_copy_fix');
  } catch { ElMessage.warning('复制失败，请手动复制'); }
}

onMounted(run);
</script>

<style scoped>
.security-page { max-width: 760px; margin: 0 auto; }
.page-desc { font-size: 13px; color: var(--text-muted); }
.security-card { padding: 20px 24px; }
.security-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.security-title { font-size: 18px; font-weight: 600; color: var(--text-main); }
.security-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.security-loading { min-height: 220px; }
.security-unavail { margin-bottom: 4px; }

.security-item {
  display: flex; gap: 12px; padding: 14px 0;
  border-top: 1px solid var(--border);
}
.s-status { font-size: 20px; margin-top: 2px; flex-shrink: 0; }
.s-ok { color: var(--health-ok); }
.s-warn { color: var(--health-warn); }
.s-fail { color: var(--health-fail); }
.s-body { flex: 1; min-width: 0; }
.s-item-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
.s-detail { font-size: 13px; color: var(--text-sub); margin-top: 4px; }
.s-fix { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.s-fix-text { font-size: 13px; color: var(--text-sub); line-height: 1.6; }
.s-ok-line { margin-top: 8px; }
.s-btn-icon { margin-right: 2px; }

.security-summary {
  display: flex; align-items: center; gap: 8px;
  margin-top: 18px; padding: 12px 16px; border-radius: var(--radius);
  font-size: 14px; font-weight: 500;
}
.security-summary.is-ok { background: var(--success-light); color: var(--health-ok); }
.security-summary.is-warn { background: var(--warning-light); color: var(--health-warn); }
.security-summary.is-fail { background: var(--danger-light); color: var(--health-fail); }
.summary-count { margin-left: auto; font-size: 12px; font-weight: 400; }

@media (max-width: 768px) {
  .security-head { flex-direction: column; }
  .security-card { padding: 14px 16px; }
}
</style>