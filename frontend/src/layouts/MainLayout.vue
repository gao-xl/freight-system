<template>
  <el-container class="layout">
    <!-- ============ 侧边栏 ============ -->
    <aside class="sidebar" :class="{ collapsed }">
      <div class="logo" @click="$router.push('/tasks')">
        <img src="/icons/icon-192.svg" class="logo-icon" alt="货代管理" />
        <span v-show="!collapsed" class="logo-text">货代管理系统</span>
      </div>

      <nav class="menu-scroll">
        <div v-for="group in menuGroupsFiltered" :key="group.label" class="menu-group">
          <div v-show="!collapsed" class="group-label">{{ group.label }}</div>
          <template v-for="item in group.items" :key="item.path">
            <el-tooltip v-if="collapsed" :content="item.title" placement="right" :show-after="300">
              <div
                class="menu-item"
                :class="{ active: activeMenu === item.path }"
                @click="router.push(item.path)"
              >
                <el-icon class="mi-icon"><component :is="item.icon" /></el-icon>
              </div>
            </el-tooltip>
            <div
              v-else
              class="menu-item"
              :class="{ active: activeMenu === item.path }"
              @click="router.push(item.path)"
            >
              <el-icon class="mi-icon"><component :is="item.icon" /></el-icon>
              <span class="mi-title">{{ item.title }}</span>
            </div>
          </template>
        </div>
      </nav>

      <div class="sidebar-foot" v-show="!collapsed">
        <div class="foot-line"></div>
        <div class="foot-text">V1.0 · 货代管理</div>
      </div>
    </aside>

    <!-- ============ 主区域 ============ -->
    <el-container class="main">
      <header class="topbar">
        <div class="left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" /><Fold v-else />
          </el-icon>
          <div class="page-title">
            <span class="pt-main">{{ currentTitle }}</span>
            <span v-if="route.meta.title && route.meta.title !== currentTitle" class="pt-sub">/ {{ route.meta.title }}</span>
          </div>
        </div>

        <div class="right">
          <!-- 全局快捷搜索 -->
          <el-select
            v-model="quickSearch"
            filterable
            remote
            :remote-method="searchMenu"
            :teleported="true"
            placeholder="搜索功能…"
            class="quick-search"
            @change="goSearch"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
            <el-option
              v-for="m in searchResults"
              :key="m.path"
              :label="m.title"
              :value="m.path"
            >
              <span class="opt-label"><el-icon class="opt-icon"><component :is="m.icon" /></el-icon>{{ m.title }}</span>
              <span class="opt-group">{{ groupOf(m.path) }}</span>
            </el-option>
          </el-select>

          <el-badge v-if="auth.hasPermission('alert:read')" :value="alertCount" :max="99" :hidden="!alertCount" class="alert-badge">
            <div class="icon-btn" @click="router.push('/alerts')"><el-icon><Bell /></el-icon></div>
          </el-badge>

          <el-dropdown @command="handleCommand">
            <button class="user-chip">
              <el-avatar :size="30" class="avatar">{{ auth.displayName.slice(0, 1) }}</el-avatar>
              <span v-show="!collapsed" class="uname">{{ auth.displayName }}</span>
              <span v-if="auth.role" v-show="!collapsed" class="role-pill">{{ roleMap[auth.role] }}</span>
              <el-icon class="caret"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password"><el-icon><Key /></el-icon>修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" class="router-enter-active" />
          </transition>
        </router-view>
      </main>
    </el-container>
  </el-container>

  <!-- 修改密码弹窗 -->
  <el-dialog v-model="pwdVisible" title="修改密码" width="420px" align-center>
    <el-form :model="pwdForm" label-width="90px">
      <el-form-item label="原密码">
        <el-input v-model="pwdForm.oldPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="pwdForm.newPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="确认密码">
        <el-input v-model="pwdForm.confirm" type="password" show-password />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="pwdVisible = false">取消</el-button>
      <el-button type="primary" @click="submitPwd">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { changePasswordAPI, alertAPI } from '@/api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const collapsed = ref(false);
const pwdVisible = ref(false);
const pwdForm = ref({ oldPassword: '', newPassword: '', confirm: '' });
const alertCount = ref(0);
let alertTimer = null;

const quickSearch = ref('');
const searchResults = ref([]);

const roleMap = { admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读' };

/* ============ 信息架构：按业务逻辑分组 ============ */
const menuGroups = [
  {
    label: '工作台',
    items: [
      { path: '/tasks', title: '待办工作台', icon: 'Memo', permission: undefined },
      { path: '/dashboard', title: '经营看板', icon: 'Odometer', permission: 'dashboard:read' },
    ],
  },
  {
    label: '业务管理',
    items: [
      { path: '/customers', title: '客户管理', icon: 'User', permission: 'customer:read' },
      { path: '/suppliers', title: '供应商', icon: 'OfficeBuilding', permission: 'supplier:read' },
      { path: '/orders', title: '订单管理', icon: 'Tickets', permission: 'order:read' },
      { path: '/orders?type=export', title: '出口操作', icon: 'Promotion', permission: 'order:read' },
      { path: '/orders?type=import', title: '进口操作', icon: 'Download', permission: 'order:read' },
      { path: '/bookings', title: '订舱管理', icon: 'Ship', permission: 'booking:read' },
      { path: '/customs', title: '报关管理', icon: 'Stamp', permission: 'customs:read' },
      { path: '/documents', title: '单证管理', icon: 'Files', permission: 'document:read' },
      { path: '/tracking', title: '运输跟踪', icon: 'MapLocation', permission: 'track:read' },
    ],
  },
  {
    label: '财务与报价',
    items: [
      { path: '/finance', title: '财务管理', icon: 'Money', permission: 'finance:read' },
      { path: '/finance/statement', title: '对账单', icon: 'Tickets', permission: 'finance:read' },
      { path: '/quotations', title: '报价询价', icon: 'PriceTag', permission: 'quotation:read' },
      { path: '/import', title: '数据导入', icon: 'Upload', permission: undefined },
    ],
  },
  {
    label: '对接与数据',
    items: [
      { path: '/qingdao', title: '青岛港看板', icon: 'Ship', permission: 'qingdao:read' },
      { path: '/yards', title: '场站查询', icon: 'Van', permission: 'yard:read' },
      { path: '/external', title: '外部数据', icon: 'DataAnalysis', permission: 'track:read' },
      { path: '/integrations', title: '外部对接', icon: 'Connection', permission: 'integration:read' },
      { path: '/alerts', title: '预警中心', icon: 'Bell', permission: 'alert:read' },
      { path: '/system/business-rules', title: '业务规则', icon: 'SetUp', permission: 'alert:read' },
    ],
  },
  {
    label: '系统设置',
    items: [
      { path: '/print-templates', title: '单证模板', icon: 'Printer', permission: 'print:read' },
      { path: '/system', title: '系统管理', icon: 'Setting', permission: 'system:user' },
      { path: '/system/company', title: '公司设置', icon: 'OfficeBuilding', permission: 'system:company' },
    ],
  },
];

// 按权限过滤，空分组不渲染
const menuGroupsFiltered = computed(() =>
  menuGroups
    .map((g) => ({ ...g, items: g.items.filter((m) => auth.hasPermission(m.permission)) }))
    .filter((g) => g.items.length)
);

const allFlat = computed(() => menuGroups.flatMap((g) => g.items));

const activeMenu = computed(() => {
  if (route.path.startsWith('/orders/')) return '/orders';
  if (route.path === '/orders' && route.query.type === 'export') return '/orders?type=export';
  if (route.path === '/orders' && route.query.type === 'import') return '/orders?type=import';
  if (route.path.startsWith('/quotations')) return '/quotations';
  if (route.path.startsWith('/finance')) return route.path === '/finance/statement' ? '/finance/statement' : '/finance';
  if (route.path.startsWith('/system')) return route.path;
  if (route.path === '/print-templates') return '/print-templates';
  return route.path;
});

const currentTitle = computed(() => {
  const hit = allFlat.value.find((m) => m.path === activeMenu.value);
  return hit?.title || route.meta.title || '工作台';
});

const groupOf = (path) => {
  const g = menuGroups.filter((grp) => grp.items.some((m) => m.path === path));
  return g[0]?.label || '';
};

/* ============ 全局搜索 ============ */
function searchMenu(q) {
  if (!q) { searchResults.value = allFlat.value.slice(0, 8); return; }
  searchResults.value = allFlat.value.filter((m) => m.title.includes(q)).slice(0, 8);
}
function goSearch(path) {
  if (path) router.push(path);
  quickSearch.value = '';
}

/* ============ 修改密码 ============ */
function handleCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout();
    router.push('/login');
    ElMessage.success('已退出登录');
  } else if (cmd === 'password') {
    pwdForm.value = { oldPassword: '', newPassword: '', confirm: '' };
    pwdVisible.value = true;
  }
}

async function submitPwd() {
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) return ElMessage.warning('请填写完整');
  if (pwdForm.value.newPassword.length < 6) return ElMessage.warning('新密码至少 6 位');
  if (pwdForm.value.newPassword !== pwdForm.value.confirm) return ElMessage.warning('两次密码不一致');
  await changePasswordAPI({ oldPassword: pwdForm.value.oldPassword, newPassword: pwdForm.value.newPassword });
  ElMessage.success('密码修改成功');
  pwdVisible.value = false;
}

/* ============ 侧边栏响应式 ============ */
function applyResponsive() {
  if (window.innerWidth < 768) collapsed.value = true;
}

async function loadAlertCount() {
  if (!auth.hasPermission('alert:read')) return;
  try {
    const data = await alertAPI.list({ status: 'active', page: 1, pageSize: 1 });
    alertCount.value = data.total || 0;
  } catch (e) { /* 忽略 */ }
}

onMounted(() => {
  applyResponsive();
  window.addEventListener('resize', applyResponsive);
  loadAlertCount();
  alertTimer = setInterval(loadAlertCount, 60000);
  searchMenu('');
});
onUnmounted(() => {
  window.removeEventListener('resize', applyResponsive);
  clearInterval(alertTimer);
});
</script>

<style scoped>
.layout { height: 100vh; }

/* ============ 侧边栏 ============ */
.sidebar {
  width: 220px;
  background: linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-bg-2) 100%);
  transition: width .22s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar.collapsed { width: 64px; }

.logo {
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.sidebar.collapsed .logo { padding: 0; justify-content: center; }
.logo-icon { width: 24px; height: 24px; display: block; flex-shrink: 0; }

.menu-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px 0 20px; }
.menu-scroll::-webkit-scrollbar { width: 4px; }
.menu-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }

.menu-group { margin-bottom: 6px; }
.group-label {
  padding: 12px 20px 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  color: rgba(159, 176, 200, 0.55);
  text-transform: uppercase;
  white-space: nowrap;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  margin: 2px 10px;
  padding: 0 12px;
  border-radius: 9px;
  color: var(--sidebar-text);
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: background .15s ease, color .15s ease;
}
.menu-item:hover { background: var(--sidebar-bg-hover); color: #fff; }
.menu-item.active {
  background: var(--sidebar-active);
  color: var(--sidebar-text-active);
  box-shadow: 0 4px 10px rgba(31, 95, 191, 0.35);
}
.sidebar.collapsed .menu-item { justify-content: center; padding: 0; margin: 2px 10px; }
.mi-icon { font-size: 18px; flex-shrink: 0; }
.mi-title { font-size: 14px; }

.sidebar-foot { padding: 12px 20px; }
.foot-line { height: 1px; background: rgba(255,255,255,0.08); margin-bottom: 10px; }
.foot-text { font-size: 11px; color: rgba(159,176,200,0.5); white-space: nowrap; }

/* ============ 主区域 ============ */
.main { min-width: 0; }

.topbar {
  height: var(--header-h);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  gap: 12px;
}
.topbar .left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.collapse-btn { font-size: 20px; cursor: pointer; color: var(--text-sub); }
.collapse-btn:hover { color: var(--brand); }
.page-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pt-main { font-size: 15px; font-weight: 600; color: var(--text-main); }
.pt-sub { font-size: 13px; color: var(--text-muted); }

.right { display: flex; align-items: center; gap: 12px; }

.quick-search { width: 220px; }
.quick-search :deep(.el-select__wrapper) { border-radius: 8px; }
.opt-label { display: inline-flex; align-items: center; gap: 6px; }
.opt-icon { font-size: 15px; }
.opt-group { float: right; font-size: 12px; color: var(--text-muted); margin-left: 16px; }

.alert-badge { display: flex; align-items: center; }
.icon-btn {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-sub); cursor: pointer;
  transition: background .15s, color .15s;
}
.icon-btn:hover { background: var(--brand-light); color: var(--brand); }
.icon-btn .el-icon { font-size: 18px; }

.user-chip {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; outline: none; border: none; background: none; padding: 4px 6px;
  border-radius: 8px;
  transition: background .15s;
}
.user-chip:hover { background: var(--brand-light); }
.avatar { background: linear-gradient(135deg, var(--brand), var(--brand-light)); color: #fff; font-weight: 600; }
.uname { font-size: 14px; color: var(--text-main); font-weight: 500; }
.role-pill {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: var(--brand-light); color: var(--brand); font-weight: 600;
}
.caret { font-size: 12px; color: var(--text-muted); }

.content { padding: 20px; overflow: auto; background: var(--bg-page); }

/* 页面过渡 */
.page-enter-active, .page-leave-active { transition: opacity .18s ease, transform .18s ease; }
.page-enter-from { opacity: 0; transform: translateY(6px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }

/* ============ 窄屏 ============ */
@media (max-width: 768px) {
  .sidebar { width: 64px !important; }
  .sidebar .group-label, .sidebar .mi-title, .sidebar .foot-text { display: none; }
  .sidebar .menu-item { justify-content: center; padding: 0; }
  .topbar { padding: 0 12px; }
  .quick-search { display: none; }
  .right { gap: 8px; }
  .uname, .role-pill { display: none; }
  .content { padding: 12px; }
}
</style>