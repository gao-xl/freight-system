<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <div class="brand-panel">
      <div class="brand-inner">
        <div class="brand-logo">
          <img src="/icons/icon-192.svg" class="brand-icon" alt="货代管理" />
        </div>
        <h1 class="brand-title">货代管理系统</h1>
        <p class="brand-sub">Freight Forwarding Management System</p>
        <div class="brand-desc">面向进出口货代的一体化操作系统</div>
        <div class="feature-row">
          <div class="feature"><el-icon><Ship /></el-icon><span>订单 · 订舱 · 报关 · 单证</span></div>
          <div class="feature"><el-icon><Money /></el-icon><span>应收应付 · 对账 · 毛利</span></div>
          <div class="feature"><el-icon><Connection /></el-icon><span>港口对接 · 外部数据</span></div>
        </div>
      </div>
    </div>

    <!-- 右侧登录区 -->
    <div class="form-panel">
      <div class="form-box">
        <div class="form-head">
          <h2>欢迎回来</h2>
          <p>登录以继续使用系统</p>
        </div>
        <el-form :model="form" @keyup.enter="submit" class="login-form" size="large">
          <el-form-item>
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock" show-password />
          </el-form-item>
          <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="submit">
            登 录
          </el-button>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { safeHome } from '@/router';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const form = reactive({ username: '', password: '' });
const loading = ref(false);

// 校验 redirect 目标对当前用户是否可访问，避免跳到无权限页造成 403 死循环
function resolveHome() {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    const target = router.resolve(redirect);
    if (target.matched.length) {
      const need = target.meta.permission;
      if (!need || auth.hasPermission(need)) return redirect;
    }
  }
  return safeHome(auth);
}

async function submit() {
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码');
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push(resolveHome());
  } catch (e) {
    // 登录失败（401 等）时明确提示，避免"点了没反应"
    const msg = e?.response?.data?.message || e?.message;
    ElMessage.error(msg && msg !== 'Network Error' ? msg : '用户名或密码错误');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  background: var(--bg-page);
}

/* ============ 左侧品牌区（桌面端） ============ */
.brand-panel {
  flex: 1.1;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 15% 20%, rgba(255,255,255,0.10) 0, transparent 45%),
    radial-gradient(circle at 85% 75%, rgba(255,255,255,0.07) 0, transparent 40%),
    linear-gradient(150deg, #12345f 0%, #1f5fbf 55%, #3b82d9 100%);
  color: #fff;
  padding: 40px;
  position: relative;
  overflow: hidden;
}
.brand-panel::after {
  content: '';
  position: absolute; inset: 0;
  background-image:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 26px);
  pointer-events: none;
}
.brand-inner { position: relative; z-index: 1; max-width: 420px; }
.brand-logo { margin-bottom: 24px; }
.brand-icon { width: 72px; height: 72px; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.25)); }
.brand-title { font-size: 30px; font-weight: 700; margin: 0 0 8px; letter-spacing: 1px; }
.brand-sub { font-size: 13px; opacity: 0.8; letter-spacing: 2px; margin: 0 0 28px; }
.brand-desc { font-size: 15px; opacity: 0.92; margin-bottom: 30px; }
.feature-row { display: flex; flex-direction: column; gap: 14px; }
.feature {
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; opacity: 0.92;
  padding: 10px 14px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  backdrop-filter: blur(4px);
}
.feature .el-icon { font-size: 18px; }

/* ============ 右侧登录区 ============ */
.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-page);
  padding: 40px;
}
.form-box {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: var(--radius-xl);
  padding: 40px 36px 32px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
}
.form-head { margin-bottom: 28px; }
.form-head h2 { font-size: 24px; font-weight: 700; margin: 0 0 6px; color: var(--text-main); }
.form-head p { font-size: 14px; color: var(--text-muted); margin: 0; }
.login-btn { width: 100%; margin-top: 6px; height: 44px; font-size: 15px; }

/* ============ 窄屏：隐藏品牌区，仅保留登录 ============ */
@media (max-width: 768px) {
  .brand-panel { display: none; }
  .form-panel { padding: 24px; }
  .form-box { box-shadow: var(--shadow-md); }
}
</style>