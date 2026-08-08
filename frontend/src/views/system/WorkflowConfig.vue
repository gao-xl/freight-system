<template>
  <div class="page-card">
    <div class="toolbar">
      <el-select v-model="bizType" style="width:160px" @change="load">
        <el-option v-for="(v,k) in bizName" :key="k" :label="v" :value="k" />
      </el-select>
      <el-button type="primary" @click="openCfg()"><el-icon><Plus /></el-icon>新增流转规则</el-button>
      <el-alert class="tip" type="info" :closable="false" show-icon
        title="流程状态机配置：定义业务对象「从哪个状态 → 到哪个状态」允许谁操作。统一流转接口会校验规则、操作者角色，并自动写审计与事件。from 填 * 表示任意状态。" />
    </div>

    <el-table :data="configs" v-loading="loading" stripe>
      <el-table-column label="业务" width="90">
        <template #default="{row}">
          <el-tag size="small" :type="bizTag[row.bizType] || 'info'">{{ bizName[row.bizType] || row.bizType }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="流转" min-width="200">
        <template #default="{row}">
          <span class="flow-line">
            <el-tag size="small" effect="plain" :type="row.fromStatus === '*' ? 'warning' : 'primary'">{{ row.fromStatus }}</el-tag>
            <el-icon class="arrow"><Right /></el-icon>
            <el-tag size="small" type="success">{{ row.toStatus }}</el-tag>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="动作" width="130">
        <template #default="{row}">
          <el-tag size="small" effect="plain">{{ row.action || 'update_status' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="100">
        <template #default="{row}">{{ row.fromRole || '不限' }}</template>
      </el-table-column>
      <el-table-column label="自动" width="70">
        <template #default="{row}"><el-tag v-if="row.auto" size="small" type="danger">自动</el-tag><span v-else>-</span></template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{row}">
          <el-switch :model-value="row.enabled" @change="(v) => toggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openCfg(row)">编辑</el-button>
          <el-button link type="danger" @click="removeCfg(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑流转规则' : '新增流转规则'" width="520px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="业务类型" required>
          <el-select v-model="form.bizType" style="width:100%" :disabled="!!editing.id">
            <el-option v-for="(v,k) in bizName" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始状态" required>
          <el-select v-model="form.fromStatus" style="width:100%" filterable allow-create default-first-option>
            <el-option label="任意状态 (*)" value="*" />
            <el-option v-for="s in statusOptions[form.bizType] || []" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标状态" required>
          <el-select v-model="form.toStatus" style="width:100%" filterable>
            <el-option v-for="s in statusOptions[form.bizType] || []" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="动作">
          <el-select v-model="form.action" style="width:100%">
            <el-option label="更新状态 (update_status)" value="update_status" />
          </el-select>
        </el-form-item>
        <el-form-item label="允许角色">
          <el-select v-model="form.fromRole" style="width:100%" clearable placeholder="不限">
            <el-option label="不限" value="" />
            <el-option label="管理员" value="admin" />
            <el-option label="经理" value="manager" />
            <el-option label="操作员" value="operator" />
            <el-option label="财务" value="finance" />
          </el-select>
        </el-form-item>
        <el-form-item label="自动流转">
          <el-switch v-model="form.auto" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Right } from '@element-plus/icons-vue';
import { workflowAPI } from '@/api';

const configs = ref([]);
const loading = ref(false);
const bizType = ref('order');
const dialogVisible = ref(false);
const saving = ref(false);
const editing = ref({});
const statusOptions = ref({});
const bizName = { order: '订单', booking: '订舱', customs: '报关', finance: '财务' };
const bizTag = { order: 'primary', booking: 'warning', customs: 'danger', finance: 'success' };
const form = reactive({ bizType: 'order', fromStatus: '*', toStatus: '', action: 'update_status', fromRole: '', auto: false, sortOrder: 0, remark: '' });

async function load() {
  loading.value = true;
  try {
    const data = await workflowAPI.list({ bizType: bizType.value, pageSize: 200 });
    configs.value = data.list || [];
  } finally { loading.value = false; }
}

function openCfg(row) {
  editing.value = row || {};
  Object.assign(form, {
    bizType: row?.bizType || bizType.value,
    fromStatus: row?.fromStatus || '*',
    toStatus: row?.toStatus || '',
    action: row?.action || 'update_status',
    fromRole: row?.fromRole || '',
    auto: !!row?.auto,
    sortOrder: row?.sortOrder || 0,
    remark: row?.remark || '',
  });
  dialogVisible.value = true;
}

async function save() {
  if (!form.toStatus) return ElMessage.warning('请选择目标状态');
  const payload = { ...form, fromRole: form.fromRole || null, auto: !!form.auto, enabled: true };
  saving.value = true;
  try {
    if (editing.value.id) await workflowAPI.update(editing.value.id, payload);
    else await workflowAPI.create(payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    load();
  } finally { saving.value = false; }
}

async function toggle(row, val) {
  try {
    await workflowAPI.update(row.id, { enabled: val });
    row.enabled = val;
    ElMessage.success(val ? '已启用' : '已停用');
  } catch { load(); }
}

async function removeCfg(row) {
  await ElMessageBox.confirm(`确认删除流转规则「${row.fromStatus} → ${row.toStatus}」？`, '提示', { type: 'warning' });
  await workflowAPI.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(async () => {
  statusOptions.value = await workflowAPI.statusOptions();
  load();
});
</script>

<style scoped>
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.tip { flex: 1 1 100%; }
.flow-line { display: inline-flex; align-items: center; gap: 6px; }
.arrow { color: var(--el-text-color-secondary); }
</style>
