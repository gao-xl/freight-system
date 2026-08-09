import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 响应式列数：用于 el-descriptions / 栅格等在窄屏降低列数。
 * @param {number} desktopCols 桌面端列数
 * @param {number} mobileCols  窄屏列数
 * @param {number} breakpoint  断点（默认 768px）
 * @returns {import('vue').Ref<number>} 列数响应式引用，模板中直接绑定 :column="cols"
 */
export function useResponsiveColumns(desktopCols = 3, mobileCols = 1, breakpoint = 768) {
  const cols = ref(desktopCols);
  function update() {
    cols.value = window.innerWidth < breakpoint ? mobileCols : desktopCols;
  }
  onMounted(() => {
    update();
    window.addEventListener('resize', update);
  });
  onUnmounted(() => window.removeEventListener('resize', update));
  return cols;
}