<template>
  <div>
    <!-- 核心 4 步全完成 → 收起为完成态横幅（AC-06） -->
    <div v-if="onboarding.coreDone && !collapsed" class="ob-banner" @click="collapsed = true">
      <el-icon class="banner-icon"><CircleCheckFilled /></el-icon>
      <span>{{ copy.doneBanner }}</span>
      <el-button link type="primary" class="banner-action" @click.stop="openHelp">{{ copy.doneAction }}</el-button>
      <el-button link type="info" class="banner-ack" @click.stop="collapsed = true">{{ copy.doneAck }}</el-button>
      <el-icon class="banner-arrow"><ArrowUp /></el-icon>
    </div>

    <!-- 收起态：可点击展开回顾 -->
    <div v-else-if="onboarding.coreDone" class="ob-banner ob-banner-mini" @click="collapsed = false">
      <el-icon class="banner-icon"><CircleCheckFilled /></el-icon>
      <span>{{ copy.doneBanner }}</span>
      <el-icon class="banner-arrow"><ArrowDown /></el-icon>
    </div>

    <!-- 未完成：完整引导卡（AC-07：不再显示 → localStorage） -->
    <div v-else class="ob-card" :class="{ hidden: !visible }">
      <div class="ob-head">
        <div class="ob-title-wrap">
          <div class="ob-title">{{ copy.title }}</div>
          <div class="ob-sub">{{ copy.subtitle }}</div>
        </div>
        <el-button link type="info" @click="dismiss">{{ copy.dismiss }}</el-button>
      </div>

      <el-progress
        :percentage="percent"
        :stroke-width="6"
        :show-text="false"
        class="ob-progress"
        :color="progressColor"
      />
      <div class="ob-percent">{{ doneCount }} / {{ steps.length }} 已完成</div>

      <div class="ob-steps">
        <div
          v-for="(s, i) in steps"
          :key="s.id"
          class="ob-step"
          :class="{ done: s.done, advanced: s.advanced }"
          role="button"
          tabindex="0"
          @click="go(s)"
          @keyup.enter="go(s)"
        >
          <div class="ob-step-no" :class="{ done: s.done, current: !s.done && i === firstUndoneIndex }">
            <el-icon v-if="s.done"><CircleCheckFilled /></el-icon>
            <span v-else>{{ i + 1 }}</span>
          </div>
          <div class="ob-step-body">
            <div class="ob-step-label">
              {{ s.label }}
              <el-tag v-if="s.advanced" size="small" type="info" effect="plain">进阶</el-tag>
            </div>
            <div class="ob-step-hint">{{ s.done ? '已完成' : s.hint }}</div>
          </div>
          <span class="ob-time">{{ copy.timeHint }}</span>
          <el-button v-if="!s.done && i === firstUndoneIndex" size="small" type="primary" plain @click.stop="followAlong(s)">
            {{ copy.followAlong }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CircleCheckFilled, ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import { useOnboardingStore } from '@/stores/onboarding';
import { groupAPI } from '@/api';
import { CHECKLIST_COPY, CORE_IDS } from '@/config/checklistConfig';
import { useTour } from '@/composables/useTour';
import { useHelpCenter } from '@/composables/useHelpCenter';
import { track } from '@/utils/track';

const props = defineProps({ visible: { type: Boolean, default: true } });

const router = useRouter();
const route = useRoute();
const onboarding = useOnboardingStore();
const tour = useTour();
const help = useHelpCenter();
const collapsed = ref(false);

const copy = CHECKLIST_COPY;
const steps = computed(() => onboarding.steps);
const doneCount = computed(() => steps.value.filter((s) => s.done).length);
const percent = computed(() => Math.round((doneCount.value / steps.value.length) * 100));
const progressColor = computed(() => (doneCount.value === steps.value.length ? 'var(--onboard-step-done)' : 'var(--onboard-step-current)'));
const firstUndoneIndex = computed(() => steps.value.findIndex((s) => !s.done));

function go(step) {
  if (step.done) return;
  track('onboarding_checklist_go', { step: step.id });
  router.push(step.route);
}
function followAlong(step) {
  track('onboarding_checklist_follow', { step: step.id });
  const hash = step.id === 'customer' ? 'customer' : step.id === 'quotation' ? 'quotation' : step.id === 'order' ? 'order' : step.id;
  router.push({ path: step.route.split('?')[0], query: { ...(route.query), onboard_step: hash } });
  // 等待目标页渲染后单点高亮（data-highlight-step）
  setTimeout(() => {
    tour.highlight(`[data-highlight-step="${hash}"]`, {
      title: step.label,
      description: step.hint,
    });
  }, 600);
}
function dismiss() {
  track('onboarding_checklist_dismiss');
  onboarding.dismissChecklist();
}
function openHelp() {
  track('onboarding_checklist_done_help');
  help.open();
}

// ?onboard=1 重新打开（帮助菜单/设置入口）
watch(
  () => route.query.onboard,
  (v) => {
    if (v === '1') onboarding.setFlag('checklistDismissed', false);
  },
  { immediate: true }
);

onMounted(async () => {
  onboarding.fetchStatus();
  // 团队模式：拉取小组数（进阶建组步完成判定）
  if (onboarding.usage === 'team') {
    try {
      const groups = await groupAPI.list();
      onboarding.groupCount = (groups && groups.length) || 0;
    } catch { onboarding.groupCount = 0; }
  }
});
onBeforeUnmount(() => tour.destroy());
</script>

<style scoped>
.ob-card {
  background: var(--bg-card);
  border: 1px solid var(--onboard-border);
  border-radius: var(--radius-lg);
  padding: 16px 20px 18px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-sm);
}
.ob-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ob-title-wrap { min-width: 0; }
.ob-title { font-size: 18px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
.ob-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.ob-progress { margin-top: 14px; }
.ob-percent { font-size: 12px; color: var(--text-muted); margin: 6px 0 4px; text-align: right; }
.ob-steps { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
.ob-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard);
}
.ob-step:hover { background: var(--brand-bg); }
.ob-step:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.ob-step.done { opacity: 0.6; }
.ob-step.advanced { border-top: 1px dashed var(--border); margin-top: 4px; padding-top: 12px; }
.ob-step-no {
  width: 26px; height: 26px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--bg-page);
  border: 1px solid var(--border-strong);
  color: var(--onboard-step-todo);
  font-size: 13px; font-weight: 600;
}
.ob-step-no.done { background: var(--success-light); border-color: transparent; color: var(--onboard-step-done); }
.ob-step-no.current { background: var(--brand); border-color: transparent; color: #fff; }
.ob-step-body { flex: 1; min-width: 0; }
.ob-step-label { font-size: 14px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
.ob-step-hint { font-size: 12px; color: var(--text-muted); }
.ob-time { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

.ob-banner {
  display: flex; align-items: center; gap: 10px;
  background: var(--success-light);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  padding: 12px 18px;
  margin-bottom: 18px;
  cursor: pointer;
  color: var(--text-main);
  font-size: 14px;
  box-shadow: var(--shadow-xs);
}
.ob-banner-mini { padding: 8px 18px; font-size: 13px; }
.banner-icon { font-size: 18px; color: var(--onboard-step-done); }
.banner-action { margin-left: 4px; }
.banner-ack { margin-left: 0; }
.banner-arrow { margin-left: auto; font-size: 14px; color: var(--text-muted); }

@media (max-width: 768px) {
  .ob-card { padding: 12px 14px 14px; }
  .ob-step { padding: 6px 6px; gap: 8px; }
  .ob-step-no { width: 22px; height: 22px; font-size: 12px; }
  .ob-time, .ob-step-hint { display: none; }
  .ob-title { font-size: 16px; }
}
</style>
