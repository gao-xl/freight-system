<template>
  <div class="login-page">
    <div class="login-bg"></div>
    <div class="login-box">
      <div class="brand">
        <div class="brand-icon">🚢</div>
        <h1>货运代理管理系统</h1>
        <p>Freight Forwarding Management System</p>
      </div>
      <el-form :model="form" @keyup.enter="submit" class="login-form">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="submit">
          登 录
        </el-button>
      </el-form>
      <div class="tips">
        <span>演示账号：admin / 123456</span>
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

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const form = reactive({ username: 'admin', password: '123456' });
const loading = ref(false);

async function submit() {
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码');
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success('登录成功');
    const fallback = auth.role === 'customer' ? '/portal' : '/dashboard';
    router.push(route.query.redirect || fallback);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #0f2c52 0%, #1f5fbf 60%, #3b82d9 100%);
}
.login-bg {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08) 0, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.06) 0, transparent 40%),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 30px);
}
.login-box {
  position: relative;
  width: 400px;
  background: #fff;
  border-radius: 16px;
  padding: 40px 36px 30px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}
.brand { text-align: center; margin-bottom: 28px; }
.brand-icon { font-size: 46px; }
.brand h1 { font-size: 22px; margin: 10px 0 6px; color: var(--text-main); }
.brand p { font-size: 12px; color: var(--text-sub); letter-spacing: 1px; }
.login-btn { width: 100%; margin-top: 6px; }
.tips { margin-top: 20px; text-align: center; font-size: 13px; color: #98a2b3; }
</style>