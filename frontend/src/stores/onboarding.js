// Onboarding 引导状态 store
// 设计核心（与项目"状态派生"哲学一致）：引导进度**不存储、实时派生**自真实业务数据
//   - Checklist/空态判定 = GET /api/onboarding/status（权威源，Spec §5）
//   - 本 store 只用 localStorage 存轻量标记：向导完成 / Checklist 关闭 / 提醒去重（不存业务进度）
import { defineStore } from 'pinia';
import { getOnboardingStatus } from '@/api/onboarding';
import { checklistSteps, CORE_IDS } from '@/config/checklistConfig';

const LS_KEY = 'onboarding_flags';

function loadFlags() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveFlags(flags) {
  localStorage.setItem(LS_KEY, JSON.stringify(flags));
}

export const useOnboardingStore = defineStore('onboarding', {
  state: () => ({
    status: null, // GET /api/onboarding/status 快照 { customers, quotations, orders, bookings, declarations, financeRecords, freightRates, companyConfigured }
    groupCount: 0, // 团队模式小组数（建组进阶步完成判定）
    flags: loadFlags(), // { wizardFinished, checklistDismissed, usage, remindersShown, remindersSuppressed }
  }),
  getters: {
    // Checklist 步骤（核心 4 步 + 进阶 + 团队建组），全部派生自真实数据（AC-05）
    steps(state) {
      const usage = state.flags.usage === 'team' ? 'team' : 'personal';
      return checklistSteps
        .filter((s) => !s.teamOnly || usage === 'team')
        .map((s) => ({
          ...s,
          done: s.done(state.status, state.groupCount || 0),
        }));
    },
    coreDone() {
      const core = this.steps.filter((st) => CORE_IDS.includes(st.id));
      return core.length > 0 && core.every((st) => st.done);
    },
    allDone() {
      return this.steps.length > 0 && this.steps.every((st) => st.done);
    },
    // 是否展示 Checklist：核心未全完成 且 未被手动关闭
    showChecklist() {
      return !this.coreDone && !this.flags.checklistDismissed;
    },
    usage() {
      return this.flags.usage === 'team' ? 'team' : 'personal';
    },
  },
  actions: {
    // 拉取空态判定权威源（后端未就绪时静默失败，按"未完成"处理，不打断页面）
    async fetchStatus() {
      try {
        this.status = await getOnboardingStatus();
      } catch {
        this.status = null;
      }
      return this.status;
    },
    setFlag(key, value) {
      this.flags[key] = value;
      saveFlags(this.flags);
    },
    skipWizard() {
      this.setFlag('wizardSkipped', true);
      this.setFlag('wizardFinished', true);
    },
    finishWizard() {
      this.setFlag('wizardSkipped', false);
      this.setFlag('wizardFinished', true);
    },
    dismissChecklist() {
      this.setFlag('checklistDismissed', true);
    },
    setUsage(usage) {
      this.setFlag('usage', usage === 'team' ? 'team' : 'personal');
    },
    // 上下文提醒去重：同一场景每账号最多提示一次（自动 1 次）
    shouldRemind(key) {
      if (this.flags.remindersShown && this.flags.remindersShown[key]) return false;
      this.setFlag('remindersShown', { ...(this.flags.remindersShown || {}), [key]: true });
      return true;
    },
    // 手动"不再提示"（AC-24）：压制后该场景永不再提示
    suppressReminder(key) {
      this.setFlag('remindersSuppressed', { ...(this.flags.remindersSuppressed || {}), [key]: true });
      this.setFlag('remindersShown', { ...(this.flags.remindersShown || {}), [key]: true });
    },
    isReminderSuppressed(key) {
      return !!(this.flags.remindersSuppressed && this.flags.remindersSuppressed[key]);
    },
  },
});
