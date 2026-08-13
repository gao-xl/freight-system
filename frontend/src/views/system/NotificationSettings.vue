<template>
  <div class="page-card">
    <div class="page-head">
      <h3>通知渠道配置</h3>
      <p class="muted">配置出站通知渠道（企业微信群机器人 Webhook / 通用 Webhook / 邮件），并测试连通性。预警、订单动态等事件将按此推送。</p>
    </div>

    <el-form :model="form" label-width="140px" style="max-width: 720px" v-loading="loading">
      <el-form-item label="启用通知">
        <el-switch v-model="form.enabled" />
        <span class="muted" style="margin-left:10px">关闭后所有出站通知将停止推送</span>
      </el-form-item>

      <el-form-item label="企微 Webhook URL">
        <el-input v-model="form.webhookUrl" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." clearable />
        <div class="muted">企业微信群机器人 Webhook 地址，用于推送预警与业务动态到企业微信群。</div>
      </el-form-item>

      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选，记录渠道用途/负责人等" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
        <el-button :loading="testing" @click="test">测试推送</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { notificationAPI } from '@/api/notification';

const form = ref({ webhookUrl: '', enabled: true, remark: '' });
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await notificationAPI.getConfig();
    form.value = {
      webhookUrl: data?.webhookUrl || '',
      enabled: data?.enabled !== false,
      remark: data?.remark || '',
    };
  } catch (e) { /* 拦截器已提示 */ }
  finally { loading.value = false; }
}

async function save() {
  if (!form.value.webhookUrl) return ElMessage.warning('请填写 Webhook URL');
  saving.value = true;
  try {
    await notificationAPI.saveConfig({
      webhookUrl: form.value.webhookUrl,
      enabled: form.value.enabled,
      remark: form.value.remark,
    });
    ElMessage.success('通知配置已保存');
  } catch (e) { /* 拦截器已提示 */ }
  finally { saving.value = false; }
}

async function test() {
  testing.value = true;
  try {
    await notificationAPI.test({ channel: 'wechat_webhook', content: '这是一条测试通知' });
    ElMessage.success('测试推送成功');
  } catch (e) { /* 拦截器已提示 */ }
  finally { testing.value = false; }
}

onMounted(load);
</script>

<style scoped>
.page-head { margin-bottom: 20px; }
.page-head h3 { margin: 0 0 6px; }
.muted { color: var(--text-secondary, #909399); font-size: 12px; line-height: 1.6; margin-top: 4px; }
</style>
