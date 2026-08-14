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
        <el-form :model="form" @keyup.enter="submit" class="login-form" size="large" v-if="!twoFactor">
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

        <!-- S4 二次验证步骤 -->
        <div v-else class="twofa-block">
          <div class="twofa-head">
            <el-icon class="twofa-icon"><Lock /></el-icon>
            <h2>二次验证</h2>
            <p>为保护您的账号，请完成身份校验</p>
          </div>
          <el-alert v-if="channelHint" type="info" :closable="false" show-icon :title="channelHint" style="margin-bottom:14px" />
          <div class="code-row">
            <el-input v-model="code" placeholder="邮箱验证码 / 动态口令 / 备份码" size="large" @keyup.enter="verify2fa" />
            <el-button size="large" :loading="sending" :disabled="countdown > 0" @click="sendCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </el-button>
          </div>
          <el-button type="primary" size="large" class="login-btn" :loading="verifying" @click="verify2fa">
            验 证
          </el-button>
          <div class="twofa-back">
            <el-button link type="primary" @click="backToLogin">返回重新登录</el-button>
          </div>
        </div>
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
import { send2faAPI, verify2faAPI } from '@/api';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const form = reactive({ username: '', password: '' });
const loading = ref(false);

// S4 二次验证状态
const twoFactor = ref(false);
const pendingToken = ref('');
const channels = ref([]);
const code = ref('');
const sending = ref(false);
const verifying = ref(false);
const countdown = ref(0);
let timer = null;

const channelHint = ref('');

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
    const res = await auth.login(form.username, form.password);
    // S4：需要二次验证 → 进入验证步骤
    if (res.pending) {
      pendingToken.value = res.pendingToken;
      channels.value = res.channels || [];
      code.value = '';
      twoFactor.value = true;
      channelHint.value = channels.value.includes('totp')
        ? '请使用认证器输入动态口令，或使用邮箱验证码 / 备份码。'
        : '验证码已可发送至您的邮箱。';
      return;
    }
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

function sendCode() {
  sending.value = true;
  send2faAPI(pendingToken.value)
    .then(() => {
      ElMessage.success('验证码已发送至邮箱');
      countdown.value = 60;
      timer = setInterval(() => {
        countdown.value -= 1;
        if (countdown.value <= 0) { clearInterval(timer); timer = null; }
      }, 1000);
    })
    .finally(() => { sending.value = false; });
}

async function verify2fa() {
  if (!code.value) return ElMessage.warning('请输入验证码');
  verifying.value = true;
  try {
    const data = await verify2faAPI(pendingToken.value, code.value);
    auth.setSession(data);
    ElMessage.success('二次验证通过');
    router.push(resolveHome());
  } catch (e) {
    // 验证失败保持当前步骤，可重试
  } finally {
    verifying.value = false;
  }
}

function backToLogin() {
  twoFactor.value = false;
  pendingToken.value = '';
  code.value = '';
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

/* S4 二次验证 */
.twofa-head { text-align: center; margin-bottom: 24px; }
.twofa-icon { font-size: 30px; color: var(--brand); margin-bottom: 6px; }
.twofa-head h2 { font-size: 20px; margin: 0 0 4px; color: var(--text-main); }
.twofa-head p { font-size: 13px; color: var(--text-muted); margin: 0; }
.code-row { display: flex; gap: 8px; margin-bottom: 12px; }
.code-row .el-input { flex: 1; }
.twofa-back { margin-top: 14px; text-align: center; }

/* ============ 窄屏：隐藏品牌区，仅保留登录 ============ */
@media (max-width: 768px) {
  .brand-panel { display: none; }
  .form-panel { padding: 24px; }
  .form-box { box-shadow: var(--shadow-md); }
}
</style>