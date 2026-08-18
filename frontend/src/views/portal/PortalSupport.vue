<template>
  <div class="ps-wrap">
    <div class="ps-fab" :class="{ open: open }" @click="toggle">
      <el-icon v-if="!open"><Service /></el-icon>
      <el-icon v-else><Close /></el-icon>
    </div>
    <div v-if="open" class="ps-panel">
      <div class="ps-head">智能客服</div>
      <div class="ps-body" ref="bodyRef">
        <div v-for="(m, i) in msgs" :key="i" class="msg" :class="m.role">
          <span class="bubble">{{ m.text }}</span>
        </div>
      </div>
      <div class="ps-input">
        <el-input v-model="q" placeholder="问订单/物流/账单" @keyup.enter="send" size="small" clearable />
        <el-button type="primary" :loading="busy" size="small" @click="send">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { aiAPI } from '@/api/ai';

const open = ref(false);
const busy = ref(false);
const q = ref('');
const msgs = ref([{ role: 'bot', text: '您好，我是您的货代智能服务助手，可以为您查询订单进度、物流动态与账单信息。' }]);
const bodyRef = ref(null);

function toggle() {
  open.value = !open.value;
  if (open.value) scroll();
}
async function send() {
  const text = q.value.trim();
  if (!text || busy.value) return;
  msgs.value.push({ role: 'user', text });
  q.value = '';
  scroll();
  busy.value = true;
  try {
    const d = await aiAPI.customerSupport({ question: text });
    msgs.value.push({ role: 'bot', text: d.answer || '（无回复）' });
  } catch (e) {
    msgs.value.push({ role: 'bot', text: '抱歉，服务暂不可用，请稍后再试。' });
  } finally {
    busy.value = false;
    scroll();
  }
}
function scroll() {
  nextTick(() => { if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight; });
}
</script>

<style scoped>
.ps-wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2000; }
.ps-fab { width: 48px; height: 48px; border-radius: 50%; background: var(--primary, #409eff); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.2); font-size: 22px; }
.ps-panel { position: absolute; right: 0; bottom: 58px; width: 330px; max-width: 92vw; height: 420px; max-height: 70vh;
  background: #fff; border-radius: 12px; box-shadow: 0 12px 34px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; }
.ps-head { padding: 12px 14px; font-weight: 700; border-bottom: 1px solid #eee; }
.ps-body { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.msg.bot { justify-content: flex-start; }
.bubble { max-width: 78%; padding: 8px 11px; border-radius: 10px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.msg.user .bubble { background: var(--primary, #409eff); color: #fff; }
.msg.bot .bubble { background: #f1f3f5; color: #333; }
.ps-input { display: flex; gap: 6px; padding: 10px; border-top: 1px solid #eee; }
</style>