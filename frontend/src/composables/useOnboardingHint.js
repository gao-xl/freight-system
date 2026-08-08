// 上下文提醒（Toast 级，F6）：完成上一步动作后轻推下一步建议
// 规则（AC-23/24）：
//   - 每场景每账号最多自动提示 1 次（store 去重）
//   - 可手动「不再提示」→ 该场景永不再提示
//   - 点击建议文字跳转下一步（learning by doing）；5 秒自动消失
import { h } from 'vue';
import { ElMessage } from 'element-plus';
import router from '@/router';
import { useOnboardingStore } from '@/stores/onboarding';
import { track } from '@/utils/track';

const REMINDERS = {
  customer_created: { key: 'customer_created', message: '客户已添加，下一步：录入一份报价', to: '/quotations/edit', actionText: '去录报价' },
  quotation_saved: { key: 'quotation_saved', message: '报价已保存，下一步：转成订单', to: '/quotations', actionText: '去转订单' },
  order_created: { key: 'order_created', message: '订单已创建，下一步：发起订舱', to: '/bookings', actionText: '去订舱' },
  booking_created: { key: 'booking_created', message: '订舱已发起，下一步：安排报关', to: '/customs', actionText: '去报关' },
};

export function useOnboardingHint() {
  function showHint(key) {
    const hint = REMINDERS[key];
    if (!hint) return;
    const store = useOnboardingStore();
    if (store.isReminderSuppressed(hint.key)) return; // 手动「不再提示」（AC-24）
    if (!store.shouldRemind(hint.key)) return; // 每场景每账号 1 次（AC-23）
    track('onboarding_reminder_show', { key });

    ElMessage({
      type: 'success',
      duration: 5000,
      showClose: true,
      message: h('div', { class: 'ob-reminder', style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' }, [
        h('span', hint.message),
        h('span', { style: 'display:inline-flex;align-items:center;gap:8px' }, [
          h('a', {
            style: 'color:var(--brand);cursor:pointer;font-weight:500',
            onClick: () => {
              track('onboarding_reminder_click', { key });
              router.push(hint.to);
            },
          }, hint.actionText),
          h('a', {
            style: 'color:var(--text-muted);cursor:pointer;font-size:12px',
            onClick: () => {
              store.suppressReminder(hint.key);
              ElMessage.closeAll();
              track('onboarding_reminder_mute', { key });
            },
          }, '不再提示'),
        ]),
      ]),
    });
  }
  return { showHint };
}
