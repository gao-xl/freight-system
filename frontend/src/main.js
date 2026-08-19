import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './styles/index.css';
// 引导体系 Design Tokens（Spec §8 扩展 Token：--onboard-* / --health-* / --help-* 等）
import './styles/design-tokens.css';
// Driver.js 带跑气泡主题适配
import './styles/tour.css';

// 按需引入 Element Plus 图标：只注册实际使用到的 77 个（替代全量 293 个）
// 白名单来源：scripts/collect-icons.js 扫描模板/meta.icon 的结果。
// 新增图标时先运行 node scripts/collect-icons.js 重新生成，再同步此处与下方注册列表。
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Back, Bell, Bottom, Box,
  ChatDotRound, Check, CircleCheck, CircleCheckFilled, CircleCloseFilled,
  Clock, Close, Coin, Collection, Comment, Connection, CopyDocument,
  DataAnalysis, DataLine, Delete, Document, DocumentAdd, Download,
  Edit, EditPen, Expand, Files, Fold, FolderAdd, FolderOpened, Grid,
  InfoFilled, Key, Location, Lock, MagicStick, MapLocation, Memo,
  Message, Money, Monitor, Odometer, OfficeBuilding, Picture, PieChart,
  Plus, PriceTag, Printer, Promotion, QuestionFilled, Reading, Refresh,
  RefreshLeft, Right, Search, Select, Service, SetUp, Setting, Share,
  Ship, Stamp, SwitchButton, Ticket, Tickets, Top, TopRight, TrendCharts,
  Upload, User, Van, View, Warning, WarningFilled,
} from '@element-plus/icons-vue';

// 函数式组件样式：ElMessage/ElMessageBox/ElNotification/ElLoading 在 JS 中调用，
// unplugin-vue-components 的 resolver 不会为其注入样式，必须手动引入。
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/notification/style/css';
import 'element-plus/es/components/loading/style/css';

const app = createApp(App);

const usedIcons = {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Back, Bell, Bottom, Box,
  ChatDotRound, Check, CircleCheck, CircleCheckFilled, CircleCloseFilled,
  Clock, Close, Coin, Collection, Comment, Connection, CopyDocument,
  DataAnalysis, DataLine, Delete, Document, DocumentAdd, Download,
  Edit, EditPen, Expand, Files, Fold, FolderAdd, FolderOpened, Grid,
  InfoFilled, Key, Location, Lock, MagicStick, MapLocation, Memo,
  Message, Money, Monitor, Odometer, OfficeBuilding, Picture, PieChart,
  Plus, PriceTag, Printer, Promotion, QuestionFilled, Reading, Refresh,
  RefreshLeft, Right, Search, Select, Service, SetUp, Setting, Share,
  Ship, Stamp, SwitchButton, Ticket, Tickets, Top, TopRight, TrendCharts,
  Upload, User, Van, View, Warning, WarningFilled,
};
// 模板中 `<component :is="item.icon" />`（MainLayout 菜单等）依赖全局注册的字符串名解析
for (const [key, component] of Object.entries(usedIcons)) {
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
app.mount('#app');
