<template>
  <div class="page-card">
    <div class="toolbar">
      <el-select v-model="bizType" style="width:200px" @change="load">
        <el-option v-for="(v,k) in BIZ" :key="k" :label="v" :value="k" />
      </el-select>
      <el-button v-permission="'system:custom'" type="primary" @click="openField()"><el-icon><Plus /></el-icon>新增字段</el-button>
      <el-alert class="tip" type="info" :closable="false" show-icon
        title="自定义字段：公司可给订单/客户等业务加字段（如指定货代、付款条款），无需改代码。新增后在对应业务表单中动态渲染。" />
    </div>

    <el-table :data="fields" v-loading="loading" stripe>
      <el-table-column prop="label" label="字段名称" width="140" />
      <el-table-column prop="fieldKey" label="字段标识" width="150" />
      <el-table-column label="类型" width="100">
        <template #default="{row}">{{ fieldTypeName[row.fieldType] }}</template>
      </el-table-column>
      <el-table-column label="选项" min-width="160" show-overflow-tooltip>
        <template #default="{row}">{{ row.options ? JSON.stringify(JSON.parse(row.options)) : '-' }}</template>
      </el-table-column>
      <el-table-column label="必填" width="70"><template #default="{row}"><el-tag v-if="row.required" size="small" type="danger">必填</el-tag></template></el-table-column>
      <el-table-column label="进列表" width="80"><template #default="{row}"><el-tag v-if="row.isList" size="small" type="success">是</el-tag></template></el-table-column>
      <el-table-column label="启用" width="70"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'" size="small">{{ row.enabled?'启用':'停用' }}</el-tag></template></el-table-column>
      <el-table-column prop="sort" label="排序" width="70" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openField(row)">编辑</el-button>
          <el-button link type="danger" @click="removeField(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form.id ? '编辑字段' : '新增字段'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="业务类型">
          <el-select v-model="form.bizType" :disabled="!!form.id" style="width:100%">
            <el-option v-for="(v,k) in BIZ" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="字段标识"><el-input v-model="form.fieldKey" :disabled="!!form.id" placeholder="如 custom_agent" /></el-form-item>
        <el-form-item label="字段名称"><el-input v-model="form.label" /></el-form-item>
        <el-form-item label="字段类型">
          <el-select v-model="form.fieldType" style="width:100%">
            <el-option v-for="(v,k) in fieldTypeName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.fieldType==='enum'" label="选项值">
          <el-input v-model="optText" type="textarea" :rows="2" placeholder="每行一个选项" />
        </el-form-item>
        <el-form-item label="必填"><el-switch v-model="form.required" /></el-form-item>
        <el-form-item label="进列表"><el-switch v-model="form.isList" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customFieldAPI } from '@/api';

const BIZ = { order: '订单', customer: '客户', booking: '订舱', finance: '财务' };
const fieldTypeName = { string: '文本', number: '数字', date: '日期', enum: '下拉', bool: '开关' };
const bizType = ref('order');
const fields = ref([]);
const loading = ref(false);
const saving = ref(false);
const dlg = ref(false);
const form = ref({});
const optText = ref('');

async function load() {
  loading.value = true;
  try { fields.value = await customFieldAPI.list(bizType.value); } finally { loading.value = false; }
}
function openField(row) {
  form.value = row ? { ...row } : { bizType: bizType.value, fieldType: 'string', required: false, isList: false, enabled: true, sort: 10 };
  optText.value = form.value.options ? JSON.parse(form.value.options).join('\n') : '';
  dlg.value = true;
}
async function save() {
  if (!form.value.fieldKey || !form.value.label) return ElMessage.warning('请填写字段标识和名称');
  const payload = { ...form.value };
  if (payload.fieldType === 'enum') {
    const opts = optText.value.split('\n').map((s) => s.trim()).filter(Boolean);
    payload.options = opts;
  }
  saving.value = true;
  try {
    if (payload.id) await customFieldAPI.update(payload.id, payload);
    else await customFieldAPI.create(payload);
    ElMessage.success('保存成功');
    dlg.value = false;
    load();
  } finally { saving.value = false; }
}
async function removeField(row) {
  await ElMessageBox.confirm(`确认删除字段「${row.label}」？`, '提示', { type: 'warning' });
  await customFieldAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar { margin-bottom: 14px; display: flex; align-items: center; gap: 12px; }
.tip { flex: 1; }
</style>