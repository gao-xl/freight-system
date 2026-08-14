<template>
  <el-dialog v-model="visible" title="安全验证" width="400px" align-center :close-on-click-modal="false" :close-on-press-escape="false" :show-close="false">
    <el-alert type="warning" :closable="false" show-icon title="该操作为敏感操作，请完成二次验证后继续。" style="margin-bottom:16px" />
    <el-form @submit.prevent="verify">
      <el-form-item label="验证码">
        <div class="code-row">
          <el-input v-model="code" placeholder="邮箱验证码 / 动态口令 / 备份码" @keyup.enter="verify" />
          <el-button :loading="sending" :disabled="countdown > 0" @click="send">
            {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
          </el-button>
        </div>
      </el-form-item>
    </el-form>
    <div class="tip muted">验证码将发送至您的邮箱（亦支持 TOTP 动态口令或备份码）。</div>
    <template #footer>
      <el-button @click="cancel">取消</el-button>
      <el-button type="primary" :loading="verifying" @click="verify">确 认</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { reauthState, resolveReauth, rejectReauth } from '@/utils/reauth';
import { reauthSendAPI, reauthVerifyAPI } from '@/api';

const visible = ref(false);
const code = ref('');
const sending = ref(false);
const verifying = ref(false);
const countdown = ref(0);
let timer = null;

watch(() => reauthState.visible, (v) => {
  visible.value = v;
  code.value = '';
});

function send() {
  sending.value = true;
  reauthSendAPI()
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

async function verify() {
  if (!code.value) return ElMessage.warning('请输入验证码');
  verifying.value = true;
  try {
    const data = await reauthVerifyAPI(code.value);
    resolveReauth(data.reauthToken);
  } catch (e) {
    // 验证失败保持弹窗，可重试
  } finally {
    verifying.value = false;
  }
}

function cancel() {
  rejectReauth(new Error('reauth-cancelled'));
}

onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.code-row { display: flex; gap: 8px; width: 100%; }
.code-row .el-input { flex: 1; }
.tip { font-size: 12px; }
.muted { color: var(--text-muted); }
</style>