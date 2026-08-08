<template>
  <div class="setup-page">
    <div class="setup-card">
      <div class="setup-head">
        <div class="setup-logo">
          <img src="/icons/icon-192.svg" alt="货代管理系统" />
        </div>
        <h2>设置新密码</h2>
        <p>出于安全考虑，首次登录请立即修改默认密码</p>
      </div>
      <el-form :model="form" @keyup.enter="submit" size="large" label-position="top">
        <el-form-item label="原密码">
          <el-input v-model="form.oldPassword" type="password" placeholder="初始密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="form.newPassword" type="password" placeholder="至少 6 位" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="form.confirm" type="password" placeholder="再次输入新密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-button type="primary" size="large" class="setup-btn" :loading="loading" @click="submit">
          保存并继续
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Lock } from '@element-plus/icons-vue';
import { changePasswordAPI, loginAPI } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useOnboardingStore } from '@/stores/onboarding';
import { track } from '@/utils/track';

const router = useRouter();
const auth = useAuthStore();
const onboarding = useOnboardingStore();
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const loading = ref(false);

onMounted(() => {
  // 未登录 / 非强制改密状态 → 回首页
  if (!auth.token) return router.replace('/login');
  if (!auth.user?.mustChangePassword) return router.replace('/dashboard');
});

async function submit() {
  if (!form.oldPassword) return ElMessage.warning('请输入原密码');
  if (form.newPassword.length < 6) return ElMessage.warning('新密码至少 6 位');
  if (form.newPassword !== form.confirm) return ElMessage.warning('两次密码不一致');
  loading.value = true;
  try {
    // 改密成功 → 后端递增 tokenVersion，当前 token 即刻失效 → 用新密码无缝重登续期
    await changePasswordAPI({ oldPassword: form.oldPassword, newPassword: form.newPassword });
    await auth.login(auth.user.username, form.newPassword);
    track('onboarding_password_changed');
    ElMessage.success('密码已更新');
    // 引导未完成 → 进入快速开始；已完成 → 回首页
    router.replace(onboarding.flags.wizardFinished ? '/dashboard' : '/onboarding');
  } catch {
    /* 原密码错误等：接口已弹错误 */
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
