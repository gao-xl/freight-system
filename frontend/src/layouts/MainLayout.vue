<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo" @click="$router.push('/dashboard')">
        <span class="logo-icon">🚢</span>
        <span v-show="!collapsed" class="logo-text">货代管理系统</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        background-color="#12233f"
        text-color="#b8c4d6"
        active-text-color="#ffffff"
        class="menu"
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="main">
      <el-header class="topbar">
        <div class="left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" /><Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="right">
          <el-badge v-if="auth.hasPermission('alert:read')" :value="alertCount" :max="99" :hidden="!alertCount" class="alert-badge">
            <el-icon class="bell" @click="router.push('/alerts')"><Bell /></el-icon>
          </el-badge>
          <el-tag v-if="auth.role" size="small" effect="plain" class="role-tag">{{ roleMap[auth.role] }}</el-tag>
          <el-dropdown @command="handleCommand">
            <span class="user-chip">
              <el-avatar :size="30" class="avatar">{{ auth.displayName.slice(0, 1) }}</el-avatar>
              <span class="uname">{{ auth.displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>

  <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
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

async function loadAlertCount() {
  if (!auth.hasPermission('alert:read')) return;
  try {
    const data = await alertAPI.list({ status: 'active', page: 1, pageSize: 1 });
    alertCount.value = data.total || 0;
  } catch (e) { /* 忽略 */ }
}

const roleMap = { admin: '管理员', manager: '经理', operator: '操作员', finance: '财务', viewer: '只读' };

const allMenus = [
  { path: '/tasks', title: '待办工作台', icon: 'Memo', permission: undefined },
  { path: '/dashboard', title: '经营看板', icon: 'Odometer', permission: 'dashboard:read' },
  { path: '/customers', title: '客户管理', icon: 'User', permission: 'customer:read' },
  { path: '/suppliers', title: '供应商管理', icon: 'OfficeBuilding', permission: 'supplier:read' },
  { path: '/orders', title: '订单管理', icon: 'Document', permission: 'order:read' },
  { path: '/orders?type=export', title: '出口操作', icon: 'Promotion', permission: 'order:read' },
  { path: '/orders?type=import', title: '进口操作', icon: 'Download', permission: 'order:read' },
  { path: '/bookings', title: '订舱管理', icon: 'Ship', permission: 'booking:read' },
  { path: '/customs', title: '报关管理', icon: 'Stamp', permission: 'customs:read' },
  { path: '/documents', title: '单证管理', icon: 'Files', permission: 'document:read' },
  { path: '/tracking', title: '运输跟踪', icon: 'MapLocation', permission: 'track:read' },
  { path: '/qingdao', title: '青岛港看板', icon: 'Ship', permission: 'qingdao:read' },
  { path: '/yards', title: '场站查询', icon: 'Van', permission: 'yard:read' },
  { path: '/external', title: '外部数据', icon: 'DataAnalysis', permission: 'track:read' },
  { path: '/finance', title: '财务管理', icon: 'Money', permission: 'finance:read' },
  { path: '/quotations', title: '报价询价', icon: 'PriceTag', permission: 'quotation:read' },
  { path: '/integrations', title: '外部对接', icon: 'Connection', permission: 'integration:read' },
  { path: '/alerts', title: '预警中心', icon: 'Bell', permission: 'alert:read' },
  { path: '/system', title: '系统管理', icon: 'Setting', permission: 'system:user' },
  { path: '/system/company', title: '公司设置', icon: 'OfficeBuilding', permission: 'system:company' },
];

// 按权限过滤菜单
const menus = allMenus.filter((m) => auth.hasPermission(m.permission));

const activeMenu = computed(() => {
  if (route.path.startsWith('/orders/')) return '/orders';
  if (route.path === '/orders' && route.query.type === 'export') return '/orders?type=export';
  if (route.path === '/orders' && route.query.type === 'import') return '/orders?type=import';
  if (route.path.startsWith('/quotations')) return '/quotations';
  return route.path;
});

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

onMounted(() => {
  loadAlertCount();
  alertTimer = setInterval(loadAlertCount, 60000);
});
onUnmounted(() => clearInterval(alertTimer));
</script>

<style scoped>
.layout { height: 100vh; }
.sidebar {
  background: var(--sidebar-bg);
  transition: width 0.2s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.logo {
  height: 56px;
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
.logo-icon { font-size: 22px; }
.menu { border-right: none; flex: 1; }
.menu :deep(.el-menu-item) { height: 46px; margin: 2px 8px; border-radius: 6px; }
.menu :deep(.el-menu-item.is-active) { background: var(--sidebar-active) !important; }
.main { min-width: 0; }
.topbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.topbar .left { display: flex; align-items: center; gap: 14px; }
.collapse-btn { font-size: 20px; cursor: pointer; color: var(--text-sub); }
.right { display: flex; align-items: center; gap: 12px; }
.alert-badge { display: flex; align-items: center; }
.bell { font-size: 20px; cursor: pointer; color: var(--text-sub); }
.bell:hover { color: var(--brand); }
.role-tag { color: var(--brand); border-color: var(--brand-light); }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; outline: none; }
.avatar { background: var(--brand); color: #fff; }
.uname { font-size: 14px; color: var(--text-main); }
.content { padding: 20px; overflow: auto; background: #f4f6fa; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>