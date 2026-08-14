<template>
  <el-dialog v-model="visible" title="账户安全" width="440px" align-center>
    <div v-loading="loading">
      <!-- 已开启状态 -->
      <template v-if="me.twoFactorEnabled">
        <el-alert type="success" :closable="false" show-icon title="二次验证已开启" description="登录及敏感操作需额外验证。" style="margin-bottom:16px" />
        <el-descriptions :column="1" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="绑定通道">
            {{ me.twoFactorType === 'totp' ? 'TOTP 动态口令' : (me.twoFactorType === 'email' ? '邮箱验证码' : '多通道') }}
          </el-descriptions-item>
          <el-descriptions-item label="绑定时间">{{ me.totpVerifiedAt ? String(me.totpVerifiedAt).replace('T',' ').slice(0,19) : '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-button type="danger" plain @click="disableVisible = true">关闭二次验证</el-button>
      </template>

      <!-- 未开启：引导绑定 TOTP -->
      <template v-else>
        <el-alert type="info" :closable="false" show-icon title="二次验证未开启" description="开启需管理员在「系统管理 → 安全设置」开启总开关并标记您的账号。您可先绑定 TOTP 动态口令备用。" style="margin-bottom:16px" />
        <template v-if="!totpSetup">
          <el-button type="primary" @click="setupTotp">绑定 TOTP 动态口令</el-button>
        </template>
        <template v-else>
          <div class="qr-wrap">
            <img :src="totpSetup.qrDataURL" class="qr" alt="TOTP 二维码" />
            <div class="secret-cell">
              <div class="muted">手动输入密钥</div>
              <code>{{ totpSetup.secret }}</code>
            </div>
          </div>
          <el-alert type="warning" :closable="false" show-icon title="请妥善保存备份码（一次性）" :description="backupCodesText" style="margin-top:12px" />
        </template>
      </template>
    </div>

    <!-- 关闭二次验证（需校验密码） -->
    <el-dialog v-model="disableVisible" title="关闭二次验证" width="360px" append-to-body>
      <el-form @submit.prevent="disable">
        <el-form-item label="当前密码">
          <el-input v-model="pwd" type="password" show-password placeholder="输入密码以确认" @keyup.enter="disable" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disableVisible = false">取消</el-button>
        <el-button type="danger" :loading="disabling" @click="disable">确认关闭</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button @click="visible = false">关 闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { meAPI, setupTotpAPI, disable2faAPI } from '@/api';
import { useAuthStore } from '@/stores/auth';

const visible = ref(false);
const loading = ref(false);
const me = ref({});
const totpSetup = ref(null);
const disableVisible = ref(false);
const pwd = ref('');
const disabling = ref(false);

const backupCodesText = computed(() => (totpSetup.value?.backupCodes || []).join('　'));

async function open() {
  visible.value = true;
  loading.value = true;
  totpSetup.value = null;
  try {
    me.value = await meAPI();
  } catch (e) { /* 拦截器提示 */ }
  finally { loading.value = false; }
}

async function setupTotp() {
  try {
    totpSetup.value = await setupTotpAPI();
    ElMessage.success('已生成 TOTP 密钥，请用认证器扫描二维码');
  } catch (e) { /* 拦截器提示 */ }
}

async function disable() {
  if (!pwd.value) return ElMessage.warning('请输入当前密码');
  disabling.value = true;
  try {
    await disable2faAPI(pwd.value);
    ElMessage.success('已关闭二次验证');
    disableVisible.value = false;
    const auth = useAuthStore();
    if (auth.user) auth.user.twoFactorEnabled = false;
    me.value = await meAPI();
  } finally { disabling.value = false; }
}

defineExpose({ open });
</script>

<style scoped>
.qr-wrap { display: flex; align-items: center; gap: 16px; }
.qr { width: 168px; height: 168px; border: 1px solid var(--border); border-radius: 8px; }
.secret-cell { flex: 1; }
.muted { color: var(--text-muted); font-size: 12px; margin-bottom: 4px; }
code { font-size: 13px; word-break: break-all; }
</style>