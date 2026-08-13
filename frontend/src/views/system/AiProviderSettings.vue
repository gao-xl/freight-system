<template>
  <div class="page-card">
    <el-alert type="info" :closable="false" show-icon title="填写任意 OpenAI 兼容服务的接口地址（Base URL）与模型名即可启用 AI 助手（智能问答 / 单据识别 / 翻译生成 / 推荐预警）。" />

    <el-form :model="form" label-width="110px" class="ai-form">
      <el-form-item label="Base URL">
        <el-input v-model="form.baseUrl" placeholder="https://.../v1" />
      </el-form-item>

      <el-form-item label="API Key">
        <el-input v-model="form.apiKey" show-password type="password" :placeholder="apiKeySet ? `已配置（****${apiKeyTail}），留空则保持不变` : '粘贴服务商提供的 API Key'" />
      </el-form-item>

      <el-form-item label="模型">
        <el-input v-model="form.model" placeholder="如 openai/gpt-4o-mini、mimo-v2-pro、deepseek-chat" />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="Temperature">
            <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="最大 Token">
            <el-input-number v-model="form.maxTokens" :min="64" :max="32768" :step="256" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="启用">
        <el-switch v-model="form.enabled" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save"><el-icon><Check /></el-icon>保存设置</el-button>
        <el-button :loading="testing" :disabled="!form.apiKey && !apiKeySet" @click="testConn"><el-icon><Connection /></el-icon>测试连接</el-button>
        <el-tag v-if="testResult !== null" :type="testResult ? 'success' : 'danger'" style="margin-left:8px">
          {{ testResult ? (testMsg || '连接成功') : testMsg }}
        </el-tag>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { aiAPI } from '@/api/ai';

const form = ref({ baseUrl: '', apiKey: '', model: '', temperature: 0.3, maxTokens: 2048, enabled: false });
const apiKeySet = ref(false);
const apiKeyTail = ref('');
const saving = ref(false);
const testing = ref(false);
const testResult = ref(null);
const testMsg = ref('');

async function load() {
  try {
    const c = await aiAPI.getSettings();
    form.value = {
      baseUrl: c.baseUrl || '',
      apiKey: '',
      model: c.model || '',
      temperature: c.temperature ?? 0.3,
      maxTokens: c.maxTokens || 2048,
      enabled: !!c.enabled,
    };
    apiKeySet.value = !!c.apiKeySet;
    apiKeyTail.value = c.apiKeyTail || '';
  } catch (e) { /* 拦截器提示 */ }
}

async function save() {
  if (!form.value.baseUrl) return ElMessage.warning('请填写 Base URL');
  if (!form.value.model) return ElMessage.warning('请填写模型名');
  saving.value = true;
  try {
    await aiAPI.saveSettings({ ...form.value, apiKey: form.value.apiKey || '' });
    ElMessage.success('AI 设置已保存');
    apiKeySet.value = !!(form.value.apiKey || apiKeySet.value);
    form.value.apiKey = '';
    await load();
  } finally { saving.value = false; }
}

async function testConn() {
  const payload = { baseUrl: form.value.baseUrl, model: form.value.model, temperature: form.value.temperature, maxTokens: form.value.maxTokens };
  if (!form.value.apiKey) {
    if (apiKeySet.value) return ElMessage.warning('已保存的 Key 出于安全不回显，测试前请重新输入 API Key');
    return ElMessage.warning('请先填写 API Key 再测试');
  }
  payload.apiKey = form.value.apiKey;
  testing.value = true;
  testResult.value = null;
  try {
    const data = await aiAPI.test(payload);
    testResult.value = true;
    testMsg.value = `连接成功（${data.model || ''}）`;
    ElMessage.success('连接成功');
  } catch (e) {
    testResult.value = false;
    testMsg.value = e.message || '连接失败';
  } finally { testing.value = false; }
}

onMounted(load);
</script>

<style scoped>
.ai-form { max-width: 720px; }
</style>