// 帮助中心全局状态（模块级单例，组件间共享）
// HelpCenterDrawer 在 MainLayout 挂载一次；任意组件可调用 open() 唤起并聚焦当前模块（AC-16）
import { ref } from 'vue';

const visible = ref(false);
const currentPage = ref(''); // 当前模块对应的 guide 页（如 order → guide/orders.md）

export function useHelpCenter() {
  function open(page) {
    if (page) currentPage.value = page;
    visible.value = true;
  }
  function close() {
    visible.value = false;
  }
  return { visible, currentPage, open, close };
}
