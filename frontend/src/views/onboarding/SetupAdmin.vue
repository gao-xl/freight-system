<template>
  <div class="setup-page">
    <div class="setup-card">
      <div class="setup-head">
        <div class="setup-logo">
          <img src="/icons/icon-192.svg" alt="货代管理系统" />
        </div>
        <h2>初始化系统</h2>
        <p>系统首次运行，请创建管理员账号（该账号拥有全部权限）</p>
      </div>
      <el-form :model="form" @keyup.enter="submit" size="large" label-position="top">
        <el-form-item label="管理员用户名">
          <el-input v-model="form.username" placeholder="如 admin" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.name" placeholder="如 张三" :prefix-icon="Postcard" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="至少 6 位" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item label="确认密码">
          <el-input v-model="form.confirm" type="password" placeholder="再次输入密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-button type="primary" size="large" class="setup-btn" :loading="loading" @click="submit">
          创建并进入系统
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock, Postcard } from '@element-plus/icons-vue';
import { initStatusAPI, setupAdminAPI } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';
import { track } from '@/utils/track';

const router = useRouter();
const auth = useAuthStore();
const onboarding = useOnboardingStore();
const form = reactive({ username: 'admin', name: '', password: '', confirm: '' });
const loading = ref(false);

// 已初始化（存在管理员）→ 跳登录
onMounted(async () => {
  try {
    const status = await initStatusAPI();
    if (status.hasAdmin) router.replace('/login');
  } catch { /* 网络异常时留在本页，提交时会再校验 */ }
});

async function submit() {
  if (!form.username.trim()) return ElMessage.warning('请输入用户名');
  if (!form.name.trim()) return ElMessage.warning('请输入姓名');
  if (form.password.length < 6) return ElMessage.warning('密码至少 6 位');
  if (form.password !== form.confirm) return ElMessage.warning('两次密码不一致');
  loading.value = true;
  try {
    const data = await setupAdminAPI({
      username: form.username.trim(),
      name: form.name.trim(),
      password: form.password,
    });
    auth.token = data.token;
    auth.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    track('onboarding_wizard_view', { step: 0 });
    ElMessage.success('管理员创建成功，欢迎使用');
    router.replace('/onboarding');
  } catch (e) {
    // 409 已初始化：回登录页
    if (e?.response?.status === 409) router.replace('/login');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-page);
  padding: 24px;
}
.setup-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: var(--radius-xl);
  padding: 36px 36px 32px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
}
.setup-head { text-align: center; margin-bottom: 24px; }
.setup-logo img { width: 56px; height: 56px; margin-bottom: 12px; }
.setup-head h2 { font-size: 22px; font-weight: 700; margin: 0 0 6px; color: var(--text-main); }
.setup-head p { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.6; }
.setup-btn { width: 100%; margin-top: 6px; height: 44px; font-size: 15px; }
</style>
