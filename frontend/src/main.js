import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './styles/index.css';

const app = createApp(App);

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 按钮级权限指令：v-permission="'order:delete'"
app.directive('permission', {
  mounted(el, binding) {
    const auth = useAuthStore();
    if (!auth.hasPermission(binding.value || '')) {
      el.parentNode?.removeChild(el);
    }
  },
});

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');