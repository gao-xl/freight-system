// 轻量单点引导（Driver.js 封装）
// 用途：Checklist「跟着做一遍」→ 跳转目标页后单点高亮新建入口（data-highlight-step）
// 不做全页巡游（Spec §3 明确不做 tooltip 巡游）
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

let instance = null;

export function useTour() {
  function highlight(selector, { title = '', description = '' } = {}) {
    destroy();
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    instance = driver({
      showProgress: false,
      animate: true,
      overlayOpacity: 0.32,
      disableActiveInteraction: true,
      popoverClass: 'tour-bubble',
      steps: [
        {
          element: el,
          popover: { title, description, side: 'bottom', align: 'start' },
        },
      ],
    });
    instance.drive(0);
  }
  function destroy() {
    if (instance) {
      try { instance.destroy(); } catch { /* 已销毁 */ }
      instance = null;
    }
  }
  return { highlight, destroy };
}
