<template>
  <div>
    <el-alert type="info" :closable="false" class="intro-alert" show-icon>
      <template #title>
        系统通过「适配器 + 配置」机制与外部系统（港口 / 海关 / 财务等）对接。每个外部系统实现统一接口，通过下方配置启用并设置对接地址；新增对接只需在服务端 <code>src/integrations/adapters/</code> 新增适配器并注册即可，无需改动业务代码。
      </template>
    </el-alert>

    <div class="card-grid">
      <div v-for="item in list" :key="item.id" class="int-card" :class="{ disabled: !item.enabled }">
        <div class="int-head">
          <div class="int-ico" :style="{ background: iconBg(item.code) }">{{ iconText(item.code) }}</div>
          <div class="int-info">
            <div class="int-name">{{ item.name }}</div>
            <div class="int-code">{{ item.code }}</div>
          </div>
          <el-switch :model-value="item.enabled" @change="(v) => toggle(item, v)" />
        </div>
        <div class="int-body">
          <div class="row"><span>对接地址</span><span class="mono">{{ item.baseUrl || '未配置' }}</span></div>
          <div class="row"><span>认证方式</span><span>{{ authMap[item.authType] }}</span></div>
          <div class="row"><span>最后同步</span><span>{{ item.lastSyncAt ? fmt(item.lastSyncAt) : '从未' }}</span></div>
          <div class="int-remark">{{ item.remark || '无备注' }}</div>
        </div>
        <div class="int-actions">
          <el-button size="small" @click="openEdit(item)">编辑配置</el-button>
          <el-button size="small" type="primary" :disabled="!item.enabled" @click="test(item)">发送测试</el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="editVisible" title="对接配置" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="编码"><el-input v-model="form.code" :disabled="!!form.id" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="对接地址"><el-input v-model="form.baseUrl" placeholder="http://host:port" /></el-form-item>
        <el-form-item label="认证方式">
          <el-select v-model="form.authType" style="width:100%">
            <el-option label="无" value="none" /><el-option label="API Key" value="api_key" />
            <el-option label="Basic" value="basic" /><el-option label="OAuth2" value="oauth2" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.apiKey" show-password /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { integrationAPI, integrationTriggerAPI } from '@/api';

const list = ref([]);
const editVisible = ref(false);
const saving = ref(false);
const form = ref({});

const authMap = { none: '无', api_key: 'API Key', basic: 'Basic', oauth2: 'OAuth2' };
const iconBg = (c) => ({ port: '#0ea5e9', customs: '#f59e0b', finance: '#10b981' }[c] || '#6b7280');
const iconText = (c) => ({ port: '港', customs: '关', finance: '财' }[c] || '接');
const fmt = (t) => String(t).replace('T', ' ').slice(0, 16);

async function load() {
  const data = await integrationAPI.list({ page: 1, pageSize: 50 });
  list.value = data.list;
}

function openEdit(item) {
  form.value = { ...item };
  editVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (form.value.id) await integrationAPI.update(form.value.id, form.value);
    else await integrationAPI.create(form.value);
    ElMessage.success('配置已保存');
    editVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function toggle(item, v) {
  await integrationAPI.update(item.id, { ...item, enabled: v });
  ElMessage.success(v ? '已启用对接' : '已停用对接');
  load();
}

async function test(item) {
  try {
    await integrationTriggerAPI({ code: item.code, action: 'query', payload: { test: true, from: 'freight-system' } });
    ElMessage.success('对接请求已发出（若目标服务未启动将报连接失败）');
  } catch (e) {
    ElMessage.warning('对接失败：' + (e.message || e));
  }
}

onMounted(load);
</script>

<style scoped>
.intro-alert { margin-bottom: 16px; }
.intro-alert code { background: #eef2f7; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 16px; }
.int-card { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; border-top: 3px solid transparent; transition: all .2s; overflow: hidden; min-width: 0; }
.int-card.disabled { opacity: .65; }
.int-card.disabled { border-top-color: #cbd5e1; }
.int-card { border-top-color: var(--brand); }
.int-head { display: flex; align-items: center; gap: 12px; }
.int-ico { width: 44px; height: 44px; border-radius: 10px; color: #fff; font-size: 20px; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.int-info { min-width: 0; flex: 1; }
.int-name { font-size: 16px; font-weight: 600; }
.int-code { font-size: 12px; color: var(--text-sub); font-family: monospace; }
.int-body { margin: 16px 0; }
.int-body .row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; color: var(--text-sub); gap: 10px; flex-wrap: wrap; }
.int-body .mono { font-family: monospace; color: var(--text-main); overflow-wrap: anywhere; word-break: break-all; text-align: right; min-width: 0; }
.int-remark { background: #f7f9fc; border-radius: 6px; padding: 8px 10px; font-size: 12px; color: var(--text-sub); overflow-wrap: anywhere; }
.int-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
</style>